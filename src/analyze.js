var fs = require('fs');
const PATH_IN = './Data';
const PATH_OUT = './Analysis'
var config = {
	'ignore': 10,
	'short': 300, // Right now this isn't used
	'long': 1000, // Right now this isn't used
	'code': 500, // Right now this isn't used
	'domains': 3
};
var args = process.argv.slice(2); // Cut out node and analyze filepath arguments
var analysisData = {};
var files;
// Make sure directory with data exists
try {
	if(!fs.existsSync(PATH_IN)) {
		console.log('Error: ' + PATH_IN + ' directory not found');
		return;
	}
	files = fs.readdirSync(PATH_IN);
} catch (e) {
	console.log('Error reading ' + PATH_IN + ' directory');
	return;
}

// If no arguments, run analysis for all files
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
	if(!args[0].includes('=')) { // First arg is filename
		var file = args[0];
		if(!file.includes('.txt')) {
			file = file + '.txt';
		}
		analyzeFile(file);
	} else { // No filename, only config options, analyze all files
		for(var file of files) {
			analyzeFile(file);
		}		
	}
}

// Ensure format matches 'npm run analyze [filename] [param1=value param2=value ...]'
function validateArgs() {
	// First arg can be filename or key=val option
	if(args[0].split('=').length > 2) {
			console.log('Error: Invalid parameter assignment');
			console.log('Usage: npm run analyze [filename] [param1=value param2=value ...]');
			return false;	
	}
	// All following arguments must be key=val options
	for(var i = 1; i < args.length; i++) {
		if(args[i].split('=').length !== 2) {
			console.log('Error: Invalid parameter assignment');
			console.log('Usage: npm run analyze [filename] [param1=value param2=value ...]');
			return false;	
		}
	}
	for(var i = 0; i < args.length; i++) {
		// If they key in key=val is not a config option
		var key = args[i].split('=')[0];
		if(args[i].includes('=') && !Object.keys(config).includes(key)) {
			console.log('Warning: \'' + key + '\' is not a config property and was ignored');
		}
		// Property will still be set but never used
	}
	return true;
}

// Update config object using args global
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

// Load source data, get general information, process data, build timeline
function analyzeFile(filename) {
	var rawData = pullData(filename);
	if(!rawData) {
		return;
	}
	sortByTimestamp(rawData);
	analysisData[filename] = {};
	analysisData[filename]['metadata'] = getMetaData(rawData);
	// TODO compress gaze events, code viewing
	analysisData[filename]['timeline'] = getTimelineData(rawData);
	for(var line of analysisData[filename]['timeline']) {
		console.log(line);
	}
	// TODO save to global
}

// Load data from file, remove all gazes/pageViews with duration less than config ignore value 
function pullData(file) {
	var data = [];
	try {
		var contentSplit = fs.readFileSync(PATH_IN + '/' + file, 'utf8').split('\r\n');
	} catch (e) {
		console.log('Error trying to read ' + file + ':');
		console.log(e.message);
		console.log('Skipping file');
		return null;
	}
	var objs = contentSplit.slice(0, contentSplit.length - 1); // Exclude final newline
	for(var line of objs) {
		data.push(JSON.parse(line));
	}
	return data.filter(removeSmallGazes);
}

function removeSmallGazes(obj) {
	return !obj.hasOwnProperty('duration') || obj['duration'] > config['ignore'];
}

// This could be made more generic by making timestamp a parameter. Not sure it would ever be useful
function sortByTimestamp(arr) {
	arr.sort(function(a, b) {
		return a['timestamp'] - b['timestamp'];
	});
}

// Gets stats on general webpage and code gaze times
function getMetaData(arr) {
	var metaData = {};
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
				// TODO change this once working with a dataset with domain on all items
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
	metaData['trackedTimePercent'] = (Math.round(1000 * trackedTime/totalGazeTime)/10);
	metaData['untrackedTime'] = untrackedTime;
	metaData['untrackedTimePercent'] = (Math.round(1000 * untrackedTime/totalGazeTime)/10);
	for(var domain in domainTimes) {
		metaData[domain + 'Percent'] = (Math.round(1000 * domainTimes[domain]/trackedTime)/10);
	}
	for(var type in codeTimes) {
		metaData[type + 'Percent'] = (Math.round(1000 * codeTimes[type]/totalCodeGazeTime)/10);
	}
	metaData['pageChanges'] = pageChanges;
	metaData['topUntrackedDomains'] = topN(config['domains'], untrackedDomainTimes);
	return metaData;
}

// Gets up to the top N untracked domains ordered by time spent 
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

// Preprocess data, then get a readable format
function getTimelineData(data) {
	var newData = [];
	for(var obj of data) {
		if(obj['type'] === 'gaze' || obj['type'] === 'pageView') {
			newData.push(splitPageViewOrGaze('start', obj));
			newData.push(splitPageViewOrGaze('end', obj));
		} else {
			newData.push(obj);
		}
	}
	sortByTimestamp(newData);
	return makeReadableTimeline(newData);
}

// part should be 'start' or 'end', splits single gazes into start and end points
function splitPageViewOrGaze(part, obj) {
	var newObj = {};
	if(part == 'start') {
		newObj['type'] = obj['type'] + 'Start';
		newObj['timestamp'] = obj['timestamp'];
	} else if(part == 'end') {
		newObj['type'] = obj['type'] + 'End';
		newObj['timestamp'] = obj['timestampEnd'];
		newObj['duration'] = obj['duration'];
	}
	newObj['target'] = obj['target'];
	newObj['domain'] = obj['domain'];
	newObj['pageTitle'] = obj['pageTitle'];
	return newObj;
}

// Make strings out of event objects that can read like an activity timeline
function makeReadableTimeline(data) {
	var timeline = [];
	for(var obj of data) {
		var str = epochToTime(obj['timestamp']) + ': ';
		switch(obj['type']) {
			case 'gazeStart':
				str += 'User started looking at "' + obj['target'];
				str += '", on "' + obj['pageTitle'] + '"';
				break;
			case 'gazeEnd':
				str += 'User stopped looking at "' + obj['target'];
				str += '", on "' + obj['pageTitle'] + '"';
				str += ' after ' + Math.round(obj['duration']/10)/100 + ' seconds';
				break;
			case 'pageViewStart':
				str += 'User started looking at "' + obj['domain'] + '"';
				break;
			case 'pageViewEnd':
				str += 'User stopped looking at "' + obj['domain'] + '"';
				str += ' after ' + Math.round(obj['duration']/10)/100 + ' seconds';
				break;
			case 'Page Change': // Change this after playing with old dataset
			case 'pageChange':
				str += 'User changed pages from "' + obj['oldTitle'];
				str += '" to "' + obj['newTitle'] + '"';
				break;
			case 'setting':
				str += 'setting, not implemented'
				break;
			case 'comment':
				str += 'User stated: "' + obj['message'] + '"';
				break;
			default:
				continue;
				break;
		}
		timeline.push(str);
	}
	return timeline;
}

// From https://stackoverflow.com/questions/6312993/javascript-seconds-to-time-string-with-format-hhmmss
// Epoch time to HH:MM:SS format
function epochToTime(epoch) {
	return new Date(epoch).toTimeString().replace(/.*(\d{2}:\d{2}:\d{2}).*/, "$1");
}