import argparse
import json
import os

parser = argparse.ArgumentParser()
parser.add_argument("filename", help="Name of the file to graph", type=str)
parser.add_argument("--split", "-s", help="Was the source a split diff?", action="store_true")
parser.add_argument("--sample", help="Frequency to get data points in ms", default=10, type=int)
parser.add_argument("--ignore", help="Cutoff for gaze object removal in ms", default=50, type=int)
parser.add_argument("--merge", help="Distance in time to be considered different gazes in ms", default=200, type=int)
args = parser.parse_args()
path = './Data/'


def read_file():
    lines = []
    if not args.filename.endswith(".txt"):
        args.filename += ".txt"
    with open(path + args.filename, 'r') as file:
        for line in file:
            lines.append(json.loads(line))
    return lines

def combine_gazes(list):
    i = 0
    j = 1
    final = []
    while j < len(list):
        if list[i].should_combine(list[j]):
            list[i].consume(list[j])
            j += 1
        else:
            final.append(list[i])
            i = j
            j += 1
    return final

class Commit:
    def __init__(self, href, diffs):
        self.href = href
        self.diffs = diffs
        self.update_diffs()

    def update_diffs(self):
        self.diffs.sort(key=lambda x: int(x.index))
        total = 0
        for diff in self.diffs:
            diff.offset = total
            total += len(diff.lines) + 1  # +1 for diff separator

class Diff:
    def __init__(self, obj):
        self.file = obj['file']
        self.href = obj['pageHref']
        self.index = obj['diffIndex']
        self.lines = [Line(x) for x in obj['allLineDetails']]
        self.id = self.href + '-' + self.index
        self.offset = 0
        if args.split:
            self.make_index_map()

    def make_index_map(self):
        map = {}
        offset = 0
        for i in range(len(self.lines) - 1):
            map[self.lines[i].id] = self.lines[i].index + offset
            if (self.lines[i].type == 'deletion' and
                    self.lines[i+1].type == 'addition' and
                        self.lines[i].index == self.lines[i+1].index):
                offset += 1
        map[self.lines[i+1].id] = self.lines[i+1].index + offset  # inside loop would break conditional
        print(map)


class Gaze:
    def __init__(self, obj):
        self.target = obj['target']
        self.timestamp = obj['timestamp']
        self.timestamp_end = obj['timestampEnd']
        self.duration = obj['duration']
        self.domain = obj['domain']
        self.href = obj['pageHref']
        self.page_type = obj['pageType']


class Line:
    def __init__(self, obj):
        self.index = obj['index']
        self.file = obj['file']
        self.text = obj['codeText']
        self.commit_relative_index = None
        if obj['target'] == 'Expandable line details' or \
                        obj['target'] == 'File start marker' or \
                        obj['target'] == 'File end marker':
            self.type = 'expandable'
            self.old_start = obj['oldStart']
            self.old_end = obj['oldEnd']
            self.new_start = obj['newStart']
            self.new_end = obj['newEnd']
            self.is_change = False
        else:

            self.type = obj['change']
            self.is_change = True if self.type != 'unchanged' else False
            self.diff_index = obj['diffIndex']
            self.old_line_num = obj['oldLineNum']
            self.new_line_num = obj['newLineNum']
            self.length = obj['length']
            self.indent = obj['indentValue']
            self.indent_type = obj['indentType']
        self.id = str(self.index) + '-' + self.type


class LineGaze(Line, Gaze):
    def __init__(self, obj):
        Gaze.__init__(self, obj)
        Line.__init__(self, obj)
        self.diff_id = self.href + '-' + str(self.index)

    def should_combine(self, other):
        return (self.type == other.type and
                self.file == other.file and
                self.index == other.index and
                self.href == other.href and
                abs(self.timestamp_end - other.timestamp) < args.merge)

    def consume(self, other):
        self.timestamp_end = other.timestamp_end
        self.duration = self.timestamp_end = self.timestamp

def run():
    jsons = read_file()
    line_gazes = [LineGaze(x) for x in jsons if ((x['type'] == 'gaze') and ('index' in x))]
    commits = [Commit(x['pageHref'], [Diff(y) for y in x['diffs'] if y is not None])
               for x in jsons if x['type'] == 'diffs']
    line_gazes.sort(key=lambda x: x.timestamp)
    line_gazes_combined = combine_gazes(line_gazes)
    # modify lines
    # make data points
    # graph


run()
