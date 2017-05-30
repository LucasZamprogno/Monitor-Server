var restify = require('restify');
var fs = require('fs');
const PORT = 4321;

var sessions = {};

function echo(req, res, next) {
	res.send(200);
	console.log('echo');
	next();
}

function sendCoords(req, res, next) {
	var id = req.params['id'];
	if(!sessions[id]) {
		newSessionObject(id);
	}
	if(sessions[id]['lastX'] == null || sessions[id]['lastY'] == null || sessions[id]['lastTimestamp'] == null) {
		res.send(404);
	} else {
		res.json(200, {'x': lastX, 'y': lastY, 'timestamp': lastTimestamp});
	}
  	next();
}

function receiveCoords(req, res, next) {
	var id = req.params['id'];
	if(!sessions[id]) {
		newSessionObject(id);
	}
  	sessions[id]['lastX'] = req.params['x'];
  	sessions[id]['lastY'] = req.params['y'];
  	sessions[id]['lastTimestamp'] = req.params['timestamp'];
  	res.send(200);
  	next();
}

function receiveCoordsM(req, res, next) {
	var id = req.body['id'];
	if(!sessions[id]) {
		newSessionObject(id);
	}
  	sessions[id]['lastX'] = req.body['x'];
  	sessions[id]['lastY'] = req.body['y'];
  	sessions[id]['lastTimestamp'] = req.body['timestamp'];
  	res.send(200);
  	next();
}

function receiveData(req, res, next) {
	var id = req.params['id'];
	if(!sessions[id]) { // Really this should never hapen
		newSessionObject(id);
	}
	// Do something with it
	if(req.body.hasOwnProperty('pageHref') && req.body['pageHref'] !== sessions[id]['lastHref']) {
		if(sessions[id]['lastHref'] !== null) {
			sessions[id]['outputStream'].write(pageChangeObject(sessions[id]['lastTitle'], req.body['pageTitle'], sessions[id]['lastHref'], req.body['pageHref'], req.body['timestamp']));
		}
		sessions[id]['lastHref'] = req.body['pageHref'];
		sessions[id]['lastTitle'] = req.body['pageTitle'];
	}
	sessions[id]['outputStream'].write(req.body);
	res.send(200);
	next();
}

function pageChangeObject(oldTitle, newTitle, oldHref, newHref, timestamp) {
	return {
		'type': 'Page Change',
		'oldTitle': oldTitle,
		'newTitle': newTitle,
		'oldHref': oldHref,
		'newHref': newHref,
		'timestamp': timestamp
	};
}

function newSessionObject(id) {
	return {
		'lastX': null,
		'lastY': null,
		'lastTimestamp': null,
		'lastHref': null,
		'lastTitle': null,
		'outputStream': setupOutput(id)
	};
}

function setupOutput(id) {
	var path = './data/' + id + '.txt';
	if(!fs.existsSync(path)) {
		fs.closeSync(fs.openSync(path, 'w'));
	}
	return fs.createWriteStream(path, {flags: 'a'});
}

var server = restify.createServer({
	certificate: fs.readFileSync('cert.pem'),
	key: fs.readFileSync('cert.key'),
	name: 'Core-Server'
});

server.use(restify.bodyParser({mapParams: true}));
server.get('/echo', echo);
server.get('/coordinate', sendCoords);
server.post('/coordinate', receiveCoords);
server.post('/coordinateM', receiveCoordsM);
server.post('/data', receiveData);

server.listen(PORT, function() {
  	console.log('%s listening at %s', server.name, server.url);
});