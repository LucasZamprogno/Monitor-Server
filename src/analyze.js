var fs = require('fs');
const PATH = './Data';
var config = {
	'ignore': 10,
	'short': 300,
	'long': 1000,
	'code': 500,
	'domains': 3
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
	} else {
		for(var file of files) {
			analyzeFile(file);
		}		
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

function analyzeFile(filename) {
	var rawData = pullData(filename);
	removeSmallGazes(rawData);
	sortByStart(rawData);
	analysisData[filename] = {};
	getMetaData(filename);
	console.log(analysisData[filename]);
}

function pullData(file) {
	fileData[file] = [];
	var contentSplit = fs.readFileSync(PATH + '/' + file, 'utf8').split('\r\n');
	var objs = contentSplit.slice(0, contentSplit.length - 1); // Exclude final newline
	for(var line of objs) {
		fileData[file].push(JSON.parse(line));
	}
	return fileData[file];
}

function removeSmallGazes(arr) {
	console.log(arr.length);
	for(var index in arr) {
		if(arr[index].hasOwnProperty('duration') && arr[index]['duration'] < config['ignore']) {
			arr.splice(index, 1);
		}
	}
	console.log(arr.length);
}

// This could be made more generic by making timestamp a parameter. Not sure it would ever be useful
function sortByStart(arr) {
	arr.sort(function(a, b) {
		return a['timestamp'] - b['timestamp'];
	});
}

function getMetaData(filename) {
	var arr = fileData[filename];
	var metaData = analysisData[filename];
	var totalTime = arr[arr.length-1]['timestamp'] - arr[0]['timestamp']; // May not be perfect
	var trackedTime = 0;
	var totalGazeTime = 0;
	var totalCodeGazeTime = 0;
	var untrackedTime = 0;
	var untrackedDomainTimes = {};
	var untrackedDomains = [];
	var pageChanges = 0;
	var fileTimes = {}; // Add this when reporting filenames
	var codeTimes = {
		'addition': 0,
		'deletion': 0,
		'unchanged': 0
	};
	var domainTimes = {
		'github': 0,
		'bitbucket': 0,
		'stackoverflow': 0,
		'google': 0
	};
	for(var obj of arr) {
		switch(obj['type']) {
			case 'gaze':
				var duration = obj['duration'];
				trackedTime += duration;
				if(obj['target'] === 'Code') {// Change to 'code'
					codeTimes[obj['change']] += duration
				}
				var href = obj['pageHref'];
				if(href.includes('github')) {
					domainTimes['github'] += duration;
				} else if(href.includes('bitbucket')) {
					domainTimes['bitbucket'] += duration;
				} else if(href.includes('stackoverflow')) {
					domainTimes['stackoverflow'] += duration;
				} else if(href.includes('google')) {
					domainTimes['google'] += duration;
				}
				break;
			case 'pageView':
				var duration = obj['duration']
				untrackedTime += duration;
				var domain = obj['domain'];
				if(untrackedDomainTimes.hasOwnProperty(domain)) {
					untrackedDomainTimes[domain] += duration;
				} else {
					untrackedDomainTimes[domain] = duration;
				}
				break;
			case 'Page Change': // Change this after playing with old dataset
			case 'pageChange':
				pageChanges++;
				break;
			case 'setting':
				break;
			case 'comment':
				break;
		}
	}
	totalGazeTime = untrackedTime + trackedTime;
	for(var type in codeTimes) {
		totalCodeGazeTime += codeTimes[type];
	}
	metaData['totalTime'] = totalTime;
	metaData['trackedTime'] = trackedTime;
	metaData['trackedTimePercent'] = (Math.round(1000 * trackedTime/totalGazeTime)/1000)*100;
	metaData['untrackedTime'] = untrackedTime;
	metaData['untrackedTimePercent'] = (Math.round(1000 * untrackedTime/totalGazeTime)/1000)*100;
	for(var domain in domainTimes) {
		metaData[domain + 'Percent'] = (Math.round(1000 * domainTimes[domain]/trackedTime)/1000)*100;
	}
	for(var type in codeTimes) {
		metaData[type + 'Percent'] = (Math.round(1000 * codeTimes[type]/totalCodeGazeTime)/1000)*100;
	}
	metaData['pageChanges'] = pageChanges;
	metaData['topUntrackedDomains'] = topN(config['domains'], untrackedDomainTimes);
}

function topN(n, obj) {
	var topN = [];
	var domains = Object.keys(obj);
	for (var i = 0; i < n; i++) {
		var largest = -1;
		var best = '';
		var index = -1;
		for(var j = 0; j < domains.length; j++) {
			if(obj[domains[j]] > largest) {
				largest = obj[domains[j]];
				best = domains[j];
				index = j;
			}
		}
		topN.push(best);
		domains.splice(index, 1);
	};
	return topN;
}

function getTimelineData(filename) {

}