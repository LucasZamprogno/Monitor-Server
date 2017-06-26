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

function receiveData(req, res, next) {
	var id = req.body['id'];
	if(!sessions[id]) {
		sessions[id] = newSessionObject(id);
	}
	// Check for page focus change
	if(req.body.hasOwnProperty('pageHref') && req.body['pageHref'] !== sessions[id]['lastHref']) {
		if(sessions[id]['lastHref'] !== null) {
			var out = pageChangeObject(sessions[id]['lastTitle'], req.body['pageTitle'], sessions[id]['lastHref'], req.body['pageHref'], req.body['timestamp']);
			save(id, out);
		}
		sessions[id]['lastHref'] = req.body['pageHref'];
		sessions[id]['lastTitle'] = req.body['pageTitle'];
	}
	save(id, req.body);
	res.send(200);
	next();
}

function pageChangeObject(oldTitle, newTitle, oldHref, newHref, timestamp) {
	return {
		'type': 'pageChange',
		'oldTitle': oldTitle,
		'newTitle': newTitle,
		'oldHref': oldHref,
		'newHref': newHref,
		'timestamp': timestamp
	};
}

function newSessionObject(id) {
	return {
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
	}
	return fs.createWriteStream(filepath, {flags: 'a'});
}

function save(id, data) {
	try {
		sessions[id]['outputStream'].write(JSON.stringify(data) + '\r\n');
	} catch (e) {
		console.log(e);
	}
}

var server = restify.createServer({name: 'Home-Server'});

server.use(restify.bodyParser({mapParams: true}));
server.get('/echo', echo);
server.post('/data', receiveData);

server.listen(PORT, function() {
  	console.log('%s listening at %s', server.name, server.url);
});