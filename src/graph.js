var fs = require('fs');
var csvWriter = require('csv-write-stream');
var config = {
	'ignore': 100, // Remove all gazes less than this (ms) completely
	'merge': 250, // If two gazes on the same thing are less than this (ms) apart, merge them
	'code': 150, // Merging code lines
	'lines': 4,
};

const PATH_IN = './Data';
const PATH_OUT = './Graph'

var args = process.argv.slice(2); // Cut out node and analyze filepath arguments
var files;
var analysis = {
	'diffs': {},
	'lines': {}
};
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
		makeCSV(file);
	}
} else {
	var valid = validateArgs();
	if(!valid) {
		return;
	}
	updateConfig();
	if(!args[0].includes('=')) { // First arg is filename
		var file = args[0];
		makeCSV(file);
	} else { // No filename, only config options, analyze all files
		for(var file of files) {
			makeCSV(file);
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

function makeCSV(file) {
	var data = pullData(file);
	var lineData = data.filter(extractLineGazes);
	var diffData = data.filter(extractDiffs);
	setupDiffs(diffData);
	mergeEvents(lineData);
	sortByTimestamp(lineData);
	processLines(lineData);
	printData(file);
}

function printData(file) {
	if(!fs.existsSync(PATH_OUT)) {
		fs.mkdirSync(PATH_OUT);
	}
	if(!fs.existsSync(PATH_OUT + '/' + file)) {
		fs.mkdirSync(PATH_OUT + '/' + file);
	}
	try {
		for(var diff in analysis['lines']) {
			if(analysis['lines'][diff].length > 0) {
				if(!fs.existsSync(PATH_OUT + '/' + file + '/' + diff)) {
					fs.mkdirSync(PATH_OUT + '/' + file + '/' + diff);
				}

				var filepath = PATH_OUT + '/' + file + '/' + diff + '/gazes.csv';
				var writer = csvWriter({ headers: ['start', 'end', 'type','index']})
				writer.pipe(fs.createWriteStream(filepath))
				for(var line of analysis['lines'][diff]) {
					writer.write(lineValuesToArray(line));
				}
				writer.end()		

				filepath = PATH_OUT + '/' + file + '/' + diff + '/lines.csv';
				writer = csvWriter({ headers: ['index', 'type']})
				writer.pipe(fs.createWriteStream(filepath))
				for(var line of analysis['diffs'][diff]['allLineDetails']) {
					writer.write(diffLineValuesToArray(line));
				}
				writer.end()	
			}	
		}
	} catch(e) {
		console.log(e);
	}	
}

function pullData(file) {
	var data = [];
	try {
		var contentSplit = fs.readFileSync(PATH_IN + '/' + file + '.txt', 'utf8').split('\r\n');
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

function extractDiffs(obj) {
	return obj['type'] === 'diffs';
}

function extractLineGazes(obj) {
	return obj.hasOwnProperty('index') && obj['type'] == 'gaze';
}
// This could be made more generic by making timestamp a parameter. Not sure it would ever be useful
function sortByTimestamp(arr) {
	arr.sort(function(a, b) {
		return a['timestamp'] - b['timestamp'];
	});
}

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

function setupDiffs(data) {
	// I heard you like iteration
	for(var obj of data) {
		if(obj['type'] === 'diffs') {
			for(var diff of obj['diffs']) {
				if(diff !== null) {
					analysis['diffs'][diffID(diff)] = {
						'file': diff['file'],
						'href': diff['href'],
						'index': diff['diffIndex'],
						'allLineDetails': diff['allLineDetails'],
						'numLines': diff['allLineDetails'].length,
						'metaIndexMap': makeIndexMap(diff)
					};
					modifyDiffLines(diffID(diff));
					analysis['lines'][diffID(diff)] = [];
				}
			}
		}

	}
}

function makeIndexMap(diff) {
	var offset = 0;
	var offsetTemp = 0;
	var index = 0;
	var lastChangeBlockIndex = 0;
	var indexMap = {};
	var lines = diff['allLineDetails'];
	while(index < lines.length) {
		while(index < lines.length && !changeLine(lines[index])) {
			indexMap[indexKey(lines[index])] = lines[index]['index'] + offset;
			index++;
		}
		// Change or end of lines
		lastChangeBlockIndex = index;
		while(index < lines.length && changeLine(lines[index])) {
			if(lines[index]['change'] === 'deletion') {
				indexMap[indexKey(lines[index])] = lines[index]['index'] + offset;
				index++;
				offsetTemp++;	
			} else {
				index++;
			}
		}
		offset = offsetTemp;
		index = lastChangeBlockIndex;
		while(index < lines.length && changeLine(lines[index])) {
			if(lines[index]['change'] === 'addition') {
				indexMap[indexKey(lines[index])] = lines[index]['index'] + offset;
				index++;
			} else {
				index++;
			}
		}
	}
	return indexMap;
}

function indexKey(line) {
	if(line['target'] === "Expandable line details") {
		return line['index'].toString() + 'expandable'
	}
	return line['index'].toString() + line['change'];
}

function changeLine(line) {
	return (line.hasOwnProperty('change') && line['change'] !== 'unchanged');
}

function diffID(obj) {
	return obj['pageHref'] + '-' + obj['diffIndex'];
}

function processLines(data) {
	var startTime = data[0]['timestamp'];
	for(var line of data) {
		if(analysis['diffs'].hasOwnProperty(diffID(line))) {
			var meta = analysis['diffs'][diffID(line)]['metaIndexMap'][indexKey(line)];
			var obj = {
				'start': line['timestamp'] - startTime,
				'end': line['timestampEnd'] - startTime,
				'change': line['change'],
				'diffIndex': line['diffIndex'],
				'index': line['index'],
				'metaIndex': meta
			}
			if(line['target'] === 'Expandable line details') {
				obj['change'] = 'expandable';
			}
			analysis['lines'][diffID(line)].push(obj);	
		}
	}
}

function modifyDiffLines(id) {
	for(var line of analysis['diffs'][id]['allLineDetails']) {
		line['metaIndex'] = analysis['diffs'][id]['metaIndexMap'][indexKey(line)];
		if(line['target'] === 'Expandable line details') {
			line['change'] = 'expandable';
		}
	}
}


function lineValuesToArray(line) {
	return [line['start'], line['end'], line['change'], line['metaIndex']];
}

function diffLineValuesToArray(line) {
	return [line['metaIndex'], line['change']]
}