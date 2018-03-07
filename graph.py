import argparse
import json
import matplotlib.pyplot as plt
import os

parser = argparse.ArgumentParser()
parser.add_argument("filename", help="Name of the file to graph", type=str)
parser.add_argument("--split", "-s", help="Was the source a split diff?", action="store_true")
parser.add_argument("--show", help="Display as well as save", action="store_true")
parser.add_argument("--sample", help="Frequency to get data points in ms", default=10, type=int)
parser.add_argument("--ignore", help="Cutoff for gaze object removal in ms", default=50, type=int)
parser.add_argument("--merge", help="Distance in time to be considered different gazes in ms", default=200, type=int)
args = parser.parse_args()
path_in = './Data/'
path_out = './Graph/'


def read_file():
    lines = []
    if args.filename.endswith(".txt"):
        args.filename = args.filename[:-4]
    with open(path_in + args.filename + '.txt', 'r') as file:
        for line in file:
            lines.append(json.loads(line))
    return lines


def combine_gazes(gazes):
    i = 0
    j = 1
    final = []
    while j < len(gazes):
        if gazes[i].should_combine(gazes[j]):
            gazes[i].consume(gazes[j])
            j += 1
        else:
            final.append(gazes[i])
            i = j
            j += 1
    return final


# This will be simpler in the future
def is_graphable(line):
    return (line['type'] == 'gaze') and ('index' in line) \
            and (line['target'] != 'fileCode') and ('diffIndex' in line) and \
            ((line['change'] != 'expanded') if ('change' in line) else True)


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

    def graph(self, lines):
        x_values = []
        y_values = []
        bar_colors = []
        min_timestamp = lines[0].timestamp
        max_timestamp = lines[-1].timestamp_end - min_timestamp
        t = min_timestamp
        i = 0  # Gaze selector
        while i < len(lines):
            if lines[i].timestamp <= t < lines[i].timestamp_end:  # In current gaze
                x_values.append(t - min_timestamp)
                y_values.append(lines[i].commit_relative_index)
                t += args.sample
            elif t < lines[i].timestamp:  # In a gap
                t += args.sample
            else:  # Past current gaze
                i += 1
        for diff in self.diffs:
            for line in diff.lines:
                bar_colors.append(Commit.colorize(line.type))
            bar_colors.append('#000000')
        bar_colors = bar_colors[:-1]  # flip so 0 is at top
        fig, ax = plt.subplots()
        ax.barh(range(len(bar_colors)), [max_timestamp for _ in bar_colors], height=1, color=bar_colors)
        ax.scatter(x_values, y_values, zorder=10, s=2)
        # Manually do the legend
        green_throwaway = plt.Line2D((0, 1), (0, 0), color='#bef5cb')
        red_throwaway = plt.Line2D((0, 1), (0, 0), color='#fdaeb7')
        white_throwaway = plt.Line2D((0, 1), (0, 0), color='#ffffff')
        blue_throwaway = plt.Line2D((0, 1), (0, 0), color='#bad4ff')
        black_throwaway = plt.Line2D((0, 1), (0, 0), color='#000000')
        plt.legend([green_throwaway, red_throwaway, white_throwaway, blue_throwaway, black_throwaway],
                   ['Addition', 'Deletion', 'Unchanged', 'Expandable', 'Diff separator'],
                   bbox_to_anchor=(1.01, 1), loc=2, borderaxespad=0.)
        # /legend
        plt.xlabel('Relative timestamp (ms)')
        plt.ylabel('Commit line')
        plt.ylim(len(bar_colors) - 1, 0)
        plt.xlim(0, max_timestamp)
        path = path_out + args.filename
        if not os.path.isdir(path):
            os.mkdir(path)
        plt.savefig(path + '/' + self.href + '.pdf', type='pdf')
        if args.show:  # Order is important, this has to be after save or it saves blank
            plt.show()

    @staticmethod
    def colorize(change):
        if change == 'addition':
            return '#c1e9c1'
        elif change == 'deletion':
            return '#f1c0c0'
        elif change == 'unchanged':
            return '#ffffff'
        elif change == 'expandable':
            return '#e9f3ff'
        else:
            return 'pink'


class Diff:
    def __init__(self, obj):
        self.href = obj['pageHref']
        self.index = obj['diffIndex']
        self.lines = [Line(x) for x in obj['allLineDetails']]
        self.id = self.href + '-' + self.index
        self.offset = 0
        self.map = None
        if args.split:
            self.make_index_map()

    def make_index_map(self):
        index_map = {}
        offset = 0
        for i in range(len(self.lines) - 1):
            index_map[self.lines[i].id] = self.lines[i].index + offset
            # If there is a side by side add/del pair, increase the offset
            if (self.lines[i].type == 'deletion' and
                self.lines[i+1].type == 'addition' and
                self.lines[i].index == self.lines[i+1].index):
                offset += 1
        index_map[self.lines[i+1].id] = self.lines[i+1].index + offset  # inside loop would break conditional
        self.map = index_map


class Gaze:
    def __init__(self, obj):
        self.target = obj['target']
        self.timestamp = obj['timestamp']
        self.timestamp_end = obj['timestampEnd']
        self.duration = obj['duration']
        self.href = obj['pageHref']


class Line:
    def __init__(self, obj):
        self.index = obj['index']
        self.diff_index = obj['diffIndex']
        self.file = obj['file']
        self.commit_relative_index = self.index
        if obj['target'] == 'Expandable line details' or \
                        obj['target'] == 'File start marker' or \
                        obj['target'] == 'File end marker' or \
                        obj['target'] == 'Expandable line button':
            self.type = 'expandable'
            self.is_change = False
        elif obj['target'] == 'Inline diff comment':
            self.type = 'comment'
            self.is_change = False
        else:
            self.type = obj['change']
            self.is_change = True if self.type != 'unchanged' else False
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
    line_gazes = [LineGaze(x) for x in jsons if is_graphable(x)]
    # For each saved set of divs, make a commit object, containing diff objects
    commits = [Commit(x['pageHref'], [Diff(y) for y in x['diffs'] if y is not None])
               for x in jsons if x['type'] == 'diffs']
    line_gazes.sort(key=lambda x: x.timestamp)
    line_gazes = combine_gazes(line_gazes)
    line_gazes = [x for x in line_gazes if x.duration > args.ignore]
    # For each line, find its source diff, get its offset
    for line in line_gazes:
        for commit in commits:
            for diff in commit.diffs:
                if line.href + '-' + line.diff_index == diff.id:
                    if args.split:
                        # Temp, for old data
                        try:
                            line.commit_relative_index = diff.map[line.id]
                        except KeyError:
                            line.commit_relative_index = -1
                    line.commit_relative_index += diff.offset
                    break  # Doesn't break commit loop but oh well, minor inefficiency
    # Extract the gaze points that go with each commit, graph those gazes on that commit
    for commit in commits:
        commit.graph([x for x in line_gazes if x.href == commit.href])


run()
