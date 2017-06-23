var fs = require('fs');
const PATH = './Data';
var config = {
	'short': 300,
	'long': 1000,
	'code': 500
};
var args = process.argv.slice(2);
var fileData = {};
var analysisData = {};

if(!fs.existsSync(PATH)) {
	console.log('Data folder not found');
	return;
}
var files = fs.readdirSync(PATH);

if(args.length === 0) {
	for(var file of files) {
		analyzeFile(file);
	}
} else {
	var valid = validateArgs();
	if(!valid) {
		return;
	}
	updateConfig();
	if(!args[0].includes('=')) {
		var file = args[0];
		if(!file.includes('.txt')) {
			file = file + '.txt';
		}
		analyzeFile(file);
	}
	for(var file of files) {
		analyzeFile(file);
	}	
}

function validateArgs() {
	// First arg can be filename or key=val option
	if(args[0].split('=').length > 2) {
			console.log('Invalid parameter assignment');
			console.log('Usage: npm run analyze [filename] [param1=value param2=value ...]');
			return false;	
	}
	// All following arguments must be key=val options
	for(var i = 1; i < args.length; i++) {
		if(args[i].split('=').length !== 2) {
			console.log('Invalid parameter assignment');
			console.log('Usage: npm run analyze [filename] [param1=value param2=value ...]');
			return false;	
		}
	}
	return true;
}

function updateConfig() {
	for(var param of args) {
		if(!param.includes('=')) { // Filename
			continue;
		}
		var split = param.split('=');
		var key = split[0];
		var val = split[1];
		// This is useless for now, probably will use later
		switch(key) {
			default: // All int values
				config[key] = parseInt(val);
		}
	}
}

function pullData(file) {
	fileData[file] = [];
	var contentSplit = fs.readFileSync(PATH + '/' + file, 'utf8').split('\r\n');
	var objs = contentSplit.slice(0, contentSplit.length - 1); // Exclude final newline
	for(var line of objs) {
		fileData[file].push(JSON.parse(line));
	}
}

function analyzeFile(filename) {
	pullData(filename);
}

console.log(config);