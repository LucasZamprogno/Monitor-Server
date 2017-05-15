var restify = require('restify');
var fs = require('fs');

var xLast = null;
var yLast = null;
const PORT = 4321;

function echo(req, res, next) {
	res.send(200);
	console.log('echo');
	next();
}

function sendCoords(req, res, next) {
	if(xLast == null || yLast == null) {
		res.send(404);
	} else {
		res.json(200, {'x': xLast, 'y': yLast});
	}
  	next();
}

function receiveCoords(req, res, next) {
  	xLast = req.body['x'];
  	yLast = req.body['y'];
  	res.send(200);
  	next();
}

function receiveData(req, res, next) {
	// Do something with it
	console.log(req.body);
	res.send(200);
	next();
}

var server = restify.createServer({
	certificate: fs.readFileSync('cert.pem'),
	key: fs.readFileSync('key.pem'),
	name: 'Core-Server'
});

server.use(restify.bodyParser({mapParams: true}));
server.get('/echo', echo);
server.get('/coordinate', sendCoords);
server.post('/coordinate', receiveCoords);
server.post('/data', receiveData);

server.listen(PORT, function() {
  	console.log('%s listening at %s', server.name, server.url);
});