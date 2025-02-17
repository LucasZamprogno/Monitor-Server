/*
This file is a nightmare spawned by changing desires.
If you want to change something small, good luck.
Otherwise, I suggest rewriting it completely.
*/

var fs = require('fs');
const PATH_IN = './Data';
const PATH_OUT = './Analysis'
var config = {
	'ignore': 100, // Remove all gazes less than this (ms) completely
	'merge': 250, // If two gazes on the same thing are less than this (ms) apart, merge them
	'code': 150, // Merging code lines
	'gaze': 200, // What counts as a reportable gaze, don't think this is used (ignore does similar)
	'lines': 4,
	'domains': 5 // How many top domains to report
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

writeAllAnalysis();

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
	analysisData[filename] = {};
	analysisData[filename]['metaData'] = getMetaData(data);
	setupDiffs(analysisData[filename], data);
	addTimesToLines(analysisData[filename], data);
	expansionAnalysis(analysisData[filename], data);
	diffGazeAnalysis(analysisData[filename]);
	finalMetaAnalysisPass(analysisData[filename]);
	sortByTimestamp(data);
	mergeCodeBlocks(data);
	mergeEvents(data);
	data = data.filter(removeSmallGazes);
	//analysisData[filename]['timeline'] = getTimelineData(data);
	//analysisData[filename]['raw'] = data;
}

function writeAllAnalysis() {
	if(!fs.existsSync(PATH_OUT)) {
		fs.mkdirSync(PATH_OUT);
	}
	for(var id in analysisData) {
		var filepath = PATH_OUT + '/' + id; // id will end in .txt
		delete analysisData[id]['diffs']['allLineDetails'];
		for(var diff in analysisData[id]['diffs']) {
			delete analysisData[id]['diffs'][diff]['allLineDetails'];
		}
		fs.writeFileSync(filepath, JSON.stringify(analysisData[id]));
	}
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
	var allDomainTimes = {};
	var pageChanges = 0;
	var fileTimes = {};
	for(var obj of arr) {
		switch(obj['type']) {
			case 'gaze':
				var duration = obj['duration'];
				trackedTime += duration;
				if(obj.hasOwnProperty('file')) {
					addTo(fileTimes, obj['file'], duration);
				}
				addTo(allDomainTimes, obj['domain'], duration);
				break;
			case 'pageView':
				var duration = obj['duration']
				untrackedTime += duration;
				var domain = obj['domain'];
				addTo(allDomainTimes, domain, duration);
				break;
			case 'pageChange':
				pageChanges++;
				break;
			default:
				continue;
				break;
		}
	}
	totalGazeTime = untrackedTime + trackedTime;
	metaData['totalTime'] = msToTime(totalTime);
	metaData['trackedTime'] = msToTime(trackedTime);
	metaData['trackedTimePercent'] = (Math.round(1000 * trackedTime / totalGazeTime) / 10);
	metaData['untrackedTime'] = msToTime(untrackedTime);
	metaData['untrackedTimePercent'] = (Math.round(1000 * untrackedTime / totalGazeTime) / 10);
	if(JSON.stringify(fileTimes) !== '{}'){
		for(var file in fileTimes) {
			fileTimes[file] = msToTime(fileTimes[file]);
		}
	}
	metaData['fileTimes'] = fileTimes;
	metaData['pageChanges'] = pageChanges;
	metaData['domainTimes'] = topN(config['domains'], allDomainTimes);
	for(var domain in metaData['domainTimes']) {
		metaData['domainTimes'][domain] = msToTime(metaData['domainTimes'][domain]);
	}
	// For later
	metaData['totalCommitTime'] = 0;
	metaData['totalCodeTime'] = 0;
	metaData['totalLines'] = 0;
	metaData['totalCodeLines'] = 0;
	metaData['totalChanges'] = 0;
	metaData['totalIndent'] = 0;
	metaData['totalLength'] = 0;
	metaData['sourceFileTime'] = 0;
	metaData['indentRaw'] = 0;
	metaData['lengthRaw'] = 0;
	metaData['indexRaw'] = 0;
	metaData['additionRaw'] = 0;
	metaData['deletionRaw'] = 0;
	metaData['unchangedRaw'] = 0;
	metaData['expandedRaw'] = 0;
	metaData['additionLines'] = 0;
	metaData['additionLength'] = 0;
	metaData['deletionLines'] = 0;
	metaData['deletionLength'] = 0;
	metaData['unchangedLines'] = 0;
	metaData['unchangedLength'] = 0;
	metaData['expandableLines'] = 0;
	metaData['linesExpanded'] = 0;
	metaData['innerExpansionsExpanded'] = 0;
	metaData['indentType'] = 'none';
	return metaData;
}

// If object has property, add val. If not create and set to val
function addTo(object, property, val) {
	if(object.hasOwnProperty(property)) {
		object[property] += val;
	} else {
		object[property] = val;
	}
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
	var topN = {};
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
			topN[best] = obj[best];
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
				if(obj['target'] === 'diffCode') {
					str += 'User started looking at ';
					if(obj['change'] === 'deletion') {
						str +='a ';
					} else {
						str += 'an ';
					}
					str += obj['change'] + ' block, from lines ';
					str += obj['linesStart'] + ' to ' + obj['linesEnd'];
					str += ', on "' + obj['pageType'] + '"';
				} else {
					str += 'User started looking at "' + obj['target'];
					str += '", on "' + obj['pageType'] + '"';
				}
				break;
			case 'gazeEnd':
				if(obj['target'] === 'diffCode') {
					str += 'User stopped looking at ';
					if(obj['change'] === 'deletion') {
						str +='a ';
					} else {
						str += 'an ';
					}
					str += obj['change'] + ' block, from lines ';
					str += obj['linesStart'] + ' to ' + obj['linesEnd'];
					str += ', on "' + obj['pageType'] + '"';
				} else {
					str += 'User stopped looking at "' + obj['target'];
					str += '", on "' + obj['pageType'] + '"';
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
			case 'diffs':
				continue;
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

/***********
Code Merging
***********/

// TODO detect small blocks via unchanged/change alternation
function mergeCodeBlocks(data) {
	var i = 0;
	while(i < data.length) {
		var j = i + 1;
		var nextStart = j;
		if(data[i]['target'] === 'diffCode') {
			var codeBlock = {
				'type': 'gaze',
				'target': 'diffCode',
				'file': data[i]['file'],
				'change': data[i]['change'],
				'duration': data[i]['duration'],
				'timestamp': data[i]['timestamp'],
				'timestampEnd': data[i]['timestampEnd'],
				'domain': data[i]['domain'],
				'pageType': data[i]['pageType'],
				'pageHref': data[i]['pageHref'],
				'lines': []
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
			if(data[s]['type'] === 'gaze' && data[s]['target'] === 'diffCode' && !data[s].hasOwnProperty('linesEnd')) {
				nextStart--;
				data.splice(s, 1);
			} else {
				s++;
			}
		}
		i = nextStart;
	}
}

function shouldAddToBlock(block, obj) {
	if(obj['target'] !== 'diffCode') {
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
	block['lines'].push(lineDetails(obj));
}

function lineDetails(obj) {
	var newObj = {
		'oldLineNum': obj['oldLineNum'],
		'newLineNum': obj['newLineNum'],
		'length': obj['length'],
		'indentType': obj['indentType'],
		'indentValue': obj['indentValue']
	}
	if(obj['codeText']) {
		newObj['codeText'] = obj['codeText'];
	}
	return newObj;
}

/************
Diff analysis
************/

function diffID(obj) {
	return obj['pageHref'] + '-' + obj['diffIndex'];
}

function setupDiffs(analysis, data) {
	// I heard you like iteration
	analysis['diffs'] = {};
	for(var obj of data) {
		if(obj['type'] === 'diffs') {
			for(var diff of obj['diffs']) {
				if(diff !== null) {
					expandDiffData(analysis, diff);
					for(var line of diff['allLineDetails']) {
						line['duration'] = 0;
						if(line['target'] === 'Expandable line details') {
							line['clicked'] = false;
						}
					}
					analysis['diffs'][diffID(diff)] = diff;
				}
			}
		}
	}
}

function expandDiffData(analysis, diff) {
	var lengths = [];
	var indentations = [];
	var changedRowIndexes = [];
	var additions = 0;
	var deletions = 0;
	var unchanged = 0;
	var expandable = 0;
	var additionLength = 0;
	var deletionLength = 0;
	var unchangedLength = 0;
	var indentType = 'none';
	for(var row of diff['allLineDetails']) {
		try {
			if(row['target'] === 'diffCode') {
				lengths.push(row['length']);
				indentations.push(row['indentValue']);
				if(row['indentType'] !== 'none') {
					if(indentType === 'none') {
						indentType = row['indentType'];
					} else if(row['indentType'] !== indentType) {
						indentType = 'mixed';
					}
				}
				switch(row['change']) {
					case 'addition':
						additions++;
						additionLength += row['length'];
						changedRowIndexes.push(row['index'])
						break;
					case 'deletion':
						deletions++;
						deletionLength += row['length'];
						changedRowIndexes.push(row['index']);
						break;
					case 'unchanged':
						unchanged++;
						unchangedLength += row['length'];
						break;
				}
			} else if (row['target'] === 'Expandable line details'){
				expandable++;
			} else {
				continue;
			}
		} catch (e) {
			continue;
		}
	}
	var totalLines = diff['allLineDetails'].length;
	var totalCodeLines = additions + deletions + unchanged;
	var totalChanges = changedRowIndexes.length;
	var totalLength = additionLength + deletionLength + unchangedLength;
	diff['totalLines'] = totalLines;
	diff['totalCodeLines'] = totalCodeLines;
	diff['totalChanges'] = totalChanges;
	diff['sourceFileTime'] = 0;
	diff['additionLines'] = additions;
	diff['additionLength'] = additionLength;
	diff['additionPercentage'] = Math.round(1000 * additions / totalCodeLines)/10;
	diff['additionPercentageByLength'] = Math.round(1000 * additionLength / totalLength)/10;
	diff['deletionLines'] = deletions;
	diff['deletionLength'] = deletionLength;
	diff['deletionPercentage'] = Math.round(1000 * deletions / totalCodeLines)/10;
	diff['deletionPercentageByLength'] = Math.round(1000 * deletionLength / totalLength)/10;
	diff['unchangedLines'] = unchanged;
	diff['unchangedLength'] = unchangedLength;
	diff['unchangedPercentage'] = Math.round(1000 * unchanged / totalCodeLines)/10;
	diff['unchangedPercentageByLength'] = Math.round(1000 * unchangedLength / totalLength)/10;
	diff['expandableLines'] = expandable;
	diff['linesExpanded'] = 0;
	diff['innerExpansionsExpanded'] = 0;
	diff['medianChangeIndex'] = median(changedRowIndexes);
	diff['indentType'] = indentType;
	diff['medianIndent'] = median(indentations);
	diff['averageIndent'] = Math.round(100 * avg(indentations))/100;
	diff['minIndent'] = Math.min.apply(Math, indentations); // From https://stackoverflow.com/questions/1669190/find-the-min-max-element-of-an-array-in-javascrip;
	diff['maxIndent'] = Math.max.apply(Math, indentations);
	diff['medianLength'] = median(lengths);
	diff['minLength'] = Math.min.apply(Math, lengths);
	diff['maxLength'] = Math.max.apply(Math, lengths);
	diff['gazeData'] = {
		'totalTime': 0,
		'totalCodeTime': 0,
		'additionTime': 0,
		'deletionTime': 0,
		'unchangedTime': 0,
		'expandedTime': 0,
		'fullFileTime': 0
	};
	/////////////////////////
	analysis['metaData']['totalIndent'] += indentations.reduce((a,b) => {return a+b});
	analysis['metaData']['totalLength'] += lengths.reduce((a,b) => {return a+b});
	analysis['metaData']['totalLines'] += totalLines;
	analysis['metaData']['totalCodeLines'] += totalCodeLines;
	analysis['metaData']['totalChanges'] += totalChanges;
	analysis['metaData']['additionLines'] += additions;
	analysis['metaData']['additionLength'] += additionLength;
	analysis['metaData']['deletionLines'] += deletions;
	analysis['metaData']['deletionLength'] += deletionLength;
	analysis['metaData']['unchangedLines'] += unchanged;
	analysis['metaData']['unchangedLength'] += unchangedLength;
	analysis['metaData']['expandableLines'] += expandable;
	if(analysis['metaData']['indentType'] !== 'none' && indentType !== 'none') {
		if(analysis['metaData']['indentType'] !== indentType) {
			analysis['metaData']['indentType'] = 'mixed';
		} else {
			analysis['metaData']['indentType'] = indentType;
		}
	} else {
		analysis['metaData']['indentType'] = indentType;
	}
}

function isSameLine(line1, line2) {
	if(line1['target'] !== line2['target']) {
		if(line1['target'].includes('Expandable line')) {
			return line1['oldStart'] === line2['oldStart'] && line1['oldEnd'] === line2['oldEnd'] && line1['newStart'] === line2['newStart'] && line1['newEnd'] === line2['newEnd'];
		}
		return false;
	}
	if(line1['target'] === 'diffCode') {
		return line1['change'] === line2['change'] && line1['oldLineNum'] === line2['oldLineNum'] && line1['newLineNum'] === line2['newLineNum'];
	} else if(line1['target'] === 'Inline diff comment') {
		return line1['hashedContent'] === line2['hashedContent'];
	} else if(line1['target'] === 'File start marker') {
		return true;
	} else { // Just in case
		return false;
	}
}

function addTimesToLines(analysis, data) {
	for(var obj of data) {
		if(obj['type'] === 'gaze' && obj.hasOwnProperty('index')) { // Anything from a diff has this
			var id = diffID(obj);
			if(!analysis['diffs'].hasOwnProperty(id)) {
				console.log('Following object could not be matched to any diff:');
				console.log(obj);
			} else {
				if(obj['target'] === 'diffCode' && obj['change'] === 'expanded') {
					analysis['diffs'][id]['gazeData']['expandedTime'] += obj['duration'];
				}
				for(var line of analysis['diffs'][id]['allLineDetails']) {
					if(isSameLine(obj, line)) {
						line['duration'] += obj['duration'];
						break;
					}
				}
			}
		} else if(obj['type'] === 'gaze' && obj['target'] === 'fileCode') {
			for(var id in analysis['diffs']) {
				if(analysis['diffs'][id]['file'] === obj['file']) {
					analysis['diffs'][id]['sourceFileTime'] += obj['duration'];
					// No break, could have multiple diffs from same file
				}
			}
		}
	}
}

function expansionAnalysis(analysis, data) {
	var diffs = analysis['diffs'];
	for(var line of data) {
		if(line['type'] === 'click' && line['target'] === 'Expandable line button') {
			var id = diffID(line);
			if(diffs.hasOwnProperty(id)) {
				var found = false;
				for(var innerLine of diffs[id]['allLineDetails']) {
					if(isSameLine(innerLine, line)) {
						found = true;
						innerLine['clicked'] = true;
					}
				}
				if(found) {
					analysis[id]['metaData']['linesExpanded']++;
					diffs[id]['linesExpanded']++;
				} else {
					analysis[id]['metaData']['innerExpansionsExpanded']++;
					diffs[id]['innerExpansionsExpanded']++;
				}
			} else { // Should never happen
				console.log('Line with unfound diff:');
				console.log(line);
			}
		}
	}
	for(var key in diffs) {
		if(diffs[key]['expandableLines'] > 0) {
			diffs[key]['expandedPercentage'] = diffs[key]['linesExpanded']/diffs[key]['expandableLines'];
		}
	}
}

function diffGazeAnalysis(analysis) {
	for(var id in analysis['diffs']) {
		var diff = analysis['diffs'][id]
		var data = diff['gazeData'];
		var indentVal = 0;
		var lengthVal = 0;
		var indexVal = 0;
		for(var line of diff['allLineDetails']) {
			data['totalTime'] += line['duration'];
			if(line['target'] === 'diffCode') {
				data['totalCodeTime'] += line['duration'];
			}
			if(line['target'] === 'diffCode') {
				indentVal += line['indentValue'] * line['duration'];
				lengthVal += line['length'] * line['duration'];
			}
			indexVal += line['index'] * line['duration'];
			switch(line['change']) {
				case 'addition':
					data['additionTime'] += line['duration'];
					break;
				case 'deletion':
					data['deletionTime'] += line['duration'];
					break;
				case 'unchanged':
					data['unchangedTime'] += line['duration'];
					break;
			}
		}
		data['totalTime'] += data['expandedTime'];
		data['totalCodeTime'] += data['expandedTime'];
		data['additionPercentage'] = Math.round(1000 * data['additionTime'] / data['totalCodeTime'])/10;
		data['deletionPercentage'] = Math.round(1000 * data['deletionTime'] / data['totalCodeTime'])/10;
		data['unchangedPercentage'] = Math.round(1000 * data['unchangedTime'] / data['totalCodeTime'])/10;
		data['expandedPercentage'] = Math.round(1000 * data['expandedTime'] / data['totalCodeTime'])/10;
		data['indentAverage'] = Math.round(100 * indentVal / data['totalCodeTime'])/100,
		data['lengthAverage'] = Math.round(100 * lengthVal / data['totalCodeTime'])/100,
		data['indexAverage'] = Math.round(100 * indexVal / data['totalTime'])/100
		diff['blocks'] = makeDiffBlocks(diff['allLineDetails']);
		analysis['metaData']['indentRaw'] += indentVal;
		analysis['metaData']['lengthRaw'] += lengthVal;
		analysis['metaData']['additionRaw'] += data['additionTime'];
		analysis['metaData']['deletionRaw'] += data['deletionTime'];
		analysis['metaData']['unchangedRaw'] += data['unchangedTime'];
		analysis['metaData']['expandedRaw'] += data['expandedTime'];
	}
}

function makeDiffBlocks(lines) {
	var blocks = [];
	var i = 0;
	while(i < lines.length) {
		if(lines[i]['target'] !== 'diffCode') {
			i++;
			continue;
		}
		var codeBlock = {
			'target': 'diffCode',
			'file': lines[i]['file'],
			'change': lines[i]['change'],
			'startIndex': lines[i]['index'],
			'endIndex': lines[i]['index'],
			'numLines': 1,
			'duration': lines[i]['duration'],
			'length': lines[i]['length']
		};
		i++;
		while(i < lines.length) {
			if(lines[i]['target'] !== 'diffCode' || lines[i]['change'] !== codeBlock['change']) {
				break;
			} else {
				codeBlock['endIndex']++;
				codeBlock['numLines']++;
				codeBlock['duration'] += lines[i]['duration'];
				codeBlock['length'] += lines[i]['length'];
			}
			i++
		}
		blocks.push(codeBlock);
	}
	return blocks;
}

function finalMetaAnalysisPass(analysis) {
	var data = analysis['metaData'];
	for(var diff in analysis['diffs']) {
		data['totalCommitTime'] += analysis['diffs'][diff]['gazeData']['totalTime'];
		data['totalCodeTime'] += analysis['diffs'][diff]['gazeData']['totalCodeTime'];
	}
	data['commitAdditionPercentageByLines'] = Math.round(1000 * data['additionLines'] / data['totalCodeLines'])/10;
	data['commitAdditionPercentageByLength'] = Math.round(1000 * data['additionLength'] / data['totalLength'])/10;
	data['viewedAdditionPercentage'] = Math.round(1000 * data['additionRaw'] / data['totalCodeTime'])/10;
	data['commitDeletionPercentageByLines'] = Math.round(1000 * data['deletionLines'] / data['totalCodeLines'])/10;
	data['commitDeletionPercentageByLength'] = Math.round(1000 * data['deletionLength'] / data['totalLength'])/10;
	data['viewedDeletionPercentage'] = Math.round(1000 * data['deletionRaw'] / data['totalCodeTime'])/10;
	data['commitUnchangedPercentageByLines'] = Math.round(1000 * data['unchangedLines'] / data['totalCodeLines'])/10;
	data['commitUnchangedPercentageByLength'] = Math.round(1000 * data['unchangedLength'] / data['totalLength'])/10;
	data['viewedUnchangedPercentage'] = Math.round(1000 * data['unchangedRaw'] / data['totalCodeTime'])/10;
	data['viewedExpandedPercentage'] = Math.round(1000 * data['expandedRaw'] / data['totalCodeTime'])/10;
	data['commitAverageIndent'] = Math.round(100 * data['totalIndent'] / data['totalCodeLines'])/100;
	data['viewedAverageIndent'] = Math.round(100 * data['indentRaw'] / data['totalCodeTime'])/100;
	data['commitAverageLength'] = Math.round(100 * data['totalLength'] / data['totalCodeLines'])/100;
	data['viewedAverageLength'] = Math.round(100 * data['lengthRaw'] / data['totalCodeTime'])/100;
}

function median(arr) {
	arr.sort(function(a,b){return a-b;});
	if(arr.length === 0) {
		return 0;
	}
	var mid = Math.floor(arr.length/2);
	if(arr.length % 2) { // Odd
		return arr[mid];
	} else {
		return (arr[mid - 1] + arr[mid]) / 2;
	}
}

function avg(arr) {
	sum = 0;
	for(var item of arr) {
		sum += item;
	}
	return sum/arr.length;
}