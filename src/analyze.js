var fs = require('fs');
const PATH_IN = './Data';
const PATH_OUT = './Analysis'
var config = {
	'ignore': 50, // Remove all gazes less than this (ms) completely
	'merge': 200, // If two gazes on the same thing are less than this (ms) apart, merge them
	'gaze': 200, // What counts as a reportable gaze
	'code': 100, // Right now this isn't used
	'lines': 4,
	'domains': 3 // How many top domains to report
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
	var data = pullData(filename);
	if(!data) {
		return;
	}
	sortByTimestamp(data);
	mergeCodeBlocks(data);
	mergeEvents(data);
	data = data.filter(removeSmallGazes);
	analysisData[filename] = {};
	analysisData[filename]['metadata'] = getMetaData(data);
	analysisData[filename]['timeline'] = getTimelineData(data);
	for(var line of analysisData[filename]['timeline']) {
		console.log(line);
	}
	//console.log(analysisData[filename]['metadata']);
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
	return data;
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
				if(obj['target'] === 'code') {
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
	metaData['totalTime'] = msToTime(totalTime);
	metaData['trackedTime'] = msToTime(trackedTime);
	metaData['trackedTimePercent'] = (Math.round(1000 * trackedTime / totalGazeTime) / 10);
	metaData['untrackedTime'] = msToTime(untrackedTime);
	metaData['untrackedTimePercent'] = (Math.round(1000 * untrackedTime / totalGazeTime) / 10);
	if(trackedTime > 0) {
		for(var domain in domainTimes) {
			metaData[domain + 'Percent'] = (Math.round(1000 * domainTimes[domain] / trackedTime) / 10);
		}
	}
	if(totalCodeGazeTime > 0){
		for(var type in codeTimes) {
			metaData[type + 'Percent'] = (Math.round(1000 * codeTimes[type] / totalCodeGazeTime) / 10);
		}
	}
	metaData['pageChanges'] = pageChanges;
	if(untrackedTime > 0) {
		metaData['topUntrackedDomains'] = topN(config['domains'], untrackedDomainTimes);
	}
	return metaData;
}

// From https://coderwall.com/p/wkdefg/converting-milliseconds-to-hh-mm-ss-mmm
function msToTime(duration) {
    var milliseconds = parseInt((duration % 1000) / 100)
        , seconds = parseInt((duration / 1000) % 60)
        , minutes = parseInt((duration / (1000 * 60)) % 60)
        , hours = parseInt((duration / (1000 * 60 * 60)) % 24);

    hours = (hours < 10) ? "0" + hours : hours;
    minutes = (minutes < 10) ? "0" + minutes : minutes;
    seconds = (seconds < 10) ? "0" + seconds : seconds;

    return hours + ":" + minutes + ":" + seconds + "." + milliseconds;
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
		if(best !== '') {
			topN.push(best);
		}
		domains.splice(index, 1);
	};
	return topN;
}

// If two neighbouring gazes are the same thing and close in time, merge them
function mergeEvents(data) {
	var i = 0, j = 1;
	while(j < data.length) {
		// Seek to nearest gaze/pageView for i
		while(i < data.length - 2 && !data[i].hasOwnProperty('timestampEnd')) {
			i++;
		}
		// Seek to next nearest gaze/pageView for j
		j = i + 1;
		while(j < data.length - 1 && !data[j].hasOwnProperty('timestampEnd')) {
			j++;
		}
		// Now i and j are both on gaze or pageView entries
		if(shouldBeSameGaze(data[i], data[j])) {
			data[i]['timestampEnd'] = data[j]['timestampEnd'];
			data[i]['duration'] = data[i]['timestampEnd'] - data[i]['timestamp'];
			data.splice(j, 1);
		} else {
			i = j++; // Move i to j, put j past i
		}
	}
}

function shouldBeSameGaze(obj1, obj2) {
	// If the gazes are too far apart in time
	if(Math.abs(obj1['timestampEnd'] - obj2['timestamp']) > config['merge']) {
		return false;
	}
	for(var key in obj1) {
		if(key === 'duration' || key === 'timestamp' || key === 'timestampEnd') {
			continue;
		}
		if(obj1[key] !== obj2[key]) {
			return false;
		}
	}
	return true;
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
	for(var key in obj) {
		if(key === 'timestampEnd') {
			continue;
		}
		newObj[key] = obj[key];
	}
	if(part === 'start') {
		newObj['type'] = obj['type'] + 'Start';
	} else if(part === 'end') {
		newObj['type'] = obj['type'] + 'End';
		newObj['timestamp'] = obj['timestampEnd'];
	}
	return newObj;
}

// Make strings out of event objects that can read like an activity timeline
function makeReadableTimeline(data) {
	var timeline = [];
	for(var obj of data) {
		var str = epochToTime(obj['timestamp']) + ': ';
		switch(obj['type']) {
			case 'gazeStart':
				if(obj['target'] === 'code') {
					str += 'User started looking at ';
					if(obj['change'] === 'deletion') {
						str +='a ';
					} else {
						str += 'an ';
					}
					str += obj['change'] + ' block, from lines ';
					str += obj['linesStart'] + ' to ' + obj['linesEnd'];
					str += ', on "' + obj['pageTitle'] + '"';
				} else {
					str += 'User started looking at "' + obj['target'];
					str += '", on "' + obj['pageTitle'] + '"';
				}
				break;
			case 'gazeEnd':
				if(obj['target'] === 'code') {
					str += 'User stopped looking at ';
					if(obj['change'] === 'deletion') {
						str +='a ';
					} else {
						str += 'an ';
					}
					str += obj['change'] + ' block, from lines ';
					str += obj['linesStart'] + ' to ' + obj['linesEnd'];
					str += ', on "' + obj['pageTitle'] + '"';
				} else {
					str += 'User stopped looking at "' + obj['target'];
					str += '", on "' + obj['pageTitle'] + '"';
				}
				str += ' after ' + Math.round(obj['duration'] / 10) / 100 + ' seconds';
				break;
			case 'pageViewStart':
				str += 'User started looking at "' + obj['domain'] + '"';
				break;
			case 'pageViewEnd':
				str += 'User stopped looking at "' + obj['domain'] + '"';
				str += ' after ' + Math.round(obj['duration'] / 10) / 100 + ' seconds';
				break;
			case 'Page Change': // Change this after playing with old dataset
			case 'pageChange':
				str += 'User changed pages from "' + obj['oldTitle'];
				str += '" to "' + obj['newTitle'] + '"';
				break;
			case 'setting':
				str += 'Setting change: ' + obj['detail'];
				break;
			case 'comment':
				str += 'User stated: "' + obj['message'] + '"';
				break;
			case 'gazeLoss':
				str += 'Gaze lost';
				break;
			default:
				str += obj['type'] + ' event at ' + obj['target'] + ' on ' + obj['domain'];
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

// CODE MERGING BELOW
// TODO detect small blocks via unchanged/change alternation
function mergeCodeBlocks(data) {
	var i = 0;
	while(i < data.length) {
		var j = i + 1;
		var nextStart = j;
		if(data[i]['target'] === 'code') {
			var codeBlock = {
				'type': 'gaze',
				'target': 'code',
				'change': data[i]['change'],
				'duration': data[i]['duration'],
				'timestamp': data[i]['timestamp'],
				'timestampEnd': data[i]['timestampEnd'],
				'pageTitle': data[i]['pageTitle'],
				'pageHref': data[i]['pageHref']
				// TODO add domain
			};
			if(data[i]['change'] === 'addition') {
				codeBlock['linesStart'] = data[i]['newLineNum'];
				codeBlock['linesEnd'] = data[i]['newLineNum'];
			} else { // Unchanged using old by arbitrary choice, just be consistent
				codeBlock['linesStart'] = data[i]['oldLineNum'];
				codeBlock['linesEnd'] = data[i]['oldLineNum'];
			}
			while(j < data.length && data[j]['timestamp'] - codeBlock['timestampEnd'] < config['code']) {
				if(shouldAddToBlock(codeBlock, data[j])) {
					updateBlock(codeBlock, data[j]);
					data.splice(j, 1);
					nextStart = j; // We have a gaze up to here, definitely start after
				} else {
					j++;
					// Don't update nextStart here, we could be going over useful data for the next gaze
				}
			}
			data[i] = codeBlock;
		}
		// Trim out all single gaze points from before the code block gaze ends
		var s = i + 1;
		while(s < nextStart) {
			if(data[s]['type'] === 'gaze' && data[s]['target'] === 'code' && !data[s].hasOwnProperty('linesEnd')) {
				nextStart--;
				data.splice(s, 1);
			} else {
				s++;
			}
		}
		i = nextStart;
	}
}

// Cut out all individual code gazes between start and end
function cutCodeNoise(data, start, end) {
	
}

function shouldAddToBlock(block, obj) {
	if(obj['target'] !== 'code') {
		return false;
	}
	if(block['change'] !== obj['change']) {
		return false;
	}
	if(block['change'] === 'addition') {
		if(block['linesStart'] - obj['newLineNum'] > config['lines']) {
			return false;
		}
		if(obj['newLineNum'] - block['linesEnd'] > config['lines']) {
			return false;
		}
	} else {
		if(block['linesStart'] - obj['oldLineNum'] > config['lines']) {
			return false;
		}
		if(obj['oldLineNum'] - block['linesEnd'] > config['lines']) {
			return false;
		}
	}
	return true;
}

function updateBlock(block, obj) {
	block['timestampEnd'] = obj['timestampEnd'];
	block['duration'] += obj['duration'];
	if(block['change'] === 'addition') {
		if(block['linesStart'] > obj['newLineNum']) {
			block['linesStart'] = obj['newLineNum'];
		}
		if(block['linesEnd'] < obj['newLineNum']) {
			block['linesEnd'] = obj['newLineNum'];
		}
	} else {
		if(block['linesStart'] > obj['oldLineNum']) {
			block['linesStart'] = obj['oldLineNum'];
		}
		if(block['linesEnd'] < obj['oldLineNum']) {
			block['linesEnd'] = obj['oldLineNum'];
		}
	}
}
