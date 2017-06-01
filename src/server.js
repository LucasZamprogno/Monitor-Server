var restify = require('restify');
var fs = require('fs');
const PORT = 4321;
const PATH = './Data';

var sessions = {};

function echo(req, res, next) {
	res.send(200);
	console.log('echo');
	next();
}

function sendCoords(req, res, next) {
	var id = req.getQuery().split('=')[1];
	if(!sessions[id]) {
		sessions[id] = newSessionObject(id);
	}
	if(sessions[id]['lastX'] == null || sessions[id]['lastY'] == null || sessions[id]['lastTimestamp'] == null) {
		res.send(404);
	} else {
		res.json(200, {'x': sessions[id]['lastX'], 'y': sessions[id]['lastY'], 'timestamp': sessions[id]['lastTimestamp']});
	}
  	next();
}

function receiveCoords(req, res, next) {
	var id = req.params['id'];
	if(!sessions[id]) {
		sessions[id] = newSessionObject(id);
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
		sessions[id] = newSessionObject(id);
	}
  	sessions[id]['lastX'] = req.body['x'];
  	sessions[id]['lastY'] = req.body['y'];
  	sessions[id]['lastTimestamp'] = req.body['timestamp'];
  	res.send(200);
  	next();
}

function receiveData(req, res, next) {
	var id = req.body['id'];
	if(!sessions[id]) { // Really this should never hapen
		sessions[id] = newSessionObject(id);
	}
	// Do something with it
	if(req.body.hasOwnProperty('pageHref') && req.body['pageHref'] !== sessions[id]['lastHref']) {
		if(sessions[id]['lastHref'] !== null) {
			var out = pageChangeObject(sessions[id]['lastTitle'], req.body['pageTitle'], sessions[id]['lastHref'], req.body['pageHref'], req.body['timestamp']);
			sessions[id]['outputStream'].write(JSON.stringify(out));
		}
		sessions[id]['lastHref'] = req.body['pageHref'];
		sessions[id]['lastTitle'] = req.body['pageTitle'];
	}
	sessions[id]['outputStream'].write(JSON.stringify(req.body) + '\r\n');
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
	var filepath = PATH + '/' + id + '.txt';
	if(!fs.existsSync(filepath)) {
		if(!fs.existsSync(PATH)) {
			fs.mkdirSync(PATH);
		}
		fs.writeFileSync(filepath, 'File start \r\n', 'utf8');
	}
	return fs.createWriteStream(filepath, {flags: 'a'});
}

var server = restify.createServer({name: 'Home-Server'});

server.use(restify.bodyParser({mapParams: true}));
server.get('/echo', echo);
server.get('/coordinate', sendCoords);
server.post('/coordinate', receiveCoords);
server.post('/coordinateM', receiveCoordsM);
server.post('/data', receiveData);

server.listen(PORT, function() {
  	console.log('%s listening at %s', server.name, server.url);
});