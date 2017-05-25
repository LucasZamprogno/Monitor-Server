var restify = require('restify');
var fs = require('fs');

var lastX = null;
var lastY = null;
var lastHref = null;
var lastTitle = null;
const PORT = 4321;

function echo(req, res, next) {
	res.send(200);
	console.log('echo');
	next();
}

function sendCoords(req, res, next) {
	if(lastX == null || lastY == null) {
		res.send(404);
	} else {
		res.json(200, {'x': lastX, 'y': lastY});
	}
  	next();
}

function receiveCoords(req, res, next) {
  	lastX = req.params['x'];
  	lastY = req.params['y'];
  	res.send(200);
  	next();
}

function receiveCoordsM(req, res, next) {
  	lastX = req.body['x'];
  	lastY = req.body['y'];
  	res.send(200);
  	next();
}

function receiveData(req, res, next) {
	// Do something with it
	if(req.body.hasOwnProperty('pageHref') && req.body['pageHref'] !== lastHref) {
		if(lastHref !== null) {
			console.log(pageChangeObject(lastTitle, req.body['pageTitle'], lastHref, req.body['pageHref'], req.body['timestamp']));
		}
		lastHref = req.body['pageHref'];
		lastTitle = req.body['pageTitle'];
	}
	console.log(req.body);
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