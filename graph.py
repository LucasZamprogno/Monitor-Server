import matplotlib.pyplot as plt
import os
import csv
import math
import numpy as np


class CommitPlot:
    def __init__(self, path):
        self.path = path
        self.diffs = []
        self.xValues = []
        self.yValues = []
        self.diffRows = []
        self.barValues = []
        self.colourValues = []
        self.numRows = 0
        self.maxTimestamp = 0
        self.barWidth = 1
        self.dots = True  # this should be an argument
        for diffDir in os.listdir(path):
            if os.path.isdir(path + '/' + diffDir):
                diff = DiffPlot(path + '/' + diffDir)
                diff.readCSVs()
                self.diffs.append(diff)
                self.xValues.extend(diff.xValues)
                self.yValues.extend(diff.yValues)
                self.diffRows.extend(diff.diffRows)
                self.diffRows.append({})
                self.colourValues.extend(diff.colourValues)
                self.colourValues.append('black')
                self.numRows += diff.numRows + 1
                if diff.maxTimestamp > self.maxTimestamp:
                    self.maxTimestamp = diff.maxTimestamp
        self.diffRows = self.diffRows[:-1]
        self.diffRows = self.colourValues[:-1]
        self.numRows -= 1
        self.barValues = [self.maxTimestamp for _ in self.colourValues]

    def plotSubplots(self):
        for diff in self.diffs:
            diff.plot()

    def plot(self):
        fig, ax = plt.subplots()
        ax.barh(range(len(self.barValues)), self.barValues, height=1, color=self.colourValues)
        plt.plot(self.xValues, self.yValues, color='#bbbbbb')
        ax.scatter(self.xValues, self.yValues, zorder=10, s=2)
        plt.xlabel('Relative timestamp (ms)')
        plt.ylabel('Diff line')
        plt.title("Gaze position over time")
        plt.ylim(self.numRows-1, 0)
        plt.xlim(0, self.maxTimestamp)
        plt.savefig(self.path + '/fig.png')

class DiffPlot:
    def __init__(self, path):
        self.path = path
        self.diffRows = []
        self.xValues = []
        self.yValues = []
        self.commitIndices = []
        self.barValues = []
        self.colourValues = []
        self.numRows = 0
        self.maxTimestamp = 0
        self.barWidth = 1
        self.dots = True  # this should be an argument

    def readCSVs(self):
        self.skip = True
        with open(self.path + '/gazes.csv') as file:
            reader = csv.reader(file)
            for row in reader:
                if self.skip:
                    self.skip = False
                    continue
                if self.dots:
                    if int(row[0]) > self.maxTimestamp:
                        self.maxTimestamp = int(row[0])
                    self.xValues.append(int(row[0])) # timestamp
                    self.yValues.append(int(row[1])) # index
                    self.commitIndices.append(int(row[2]))  # commit index
                else:
                    if int(row[1]) > self.maxTimestamp:
                        self.maxTimestamp = int(row[1])
                    self.xValues.append(int(row[0])) # start
                    self.xValues.append(int(row[1])) # end
                    self.yValues.append(int(row[3])) # index
                    self.yValues.append(int(row[3])) # index
                    self.commitIndices.append(int(row[4]))  # commit index
                    self.commitIndices.append(int(row[4]))  # commit index

        self.skip = True
        with open(self.path + '/lines.csv') as file:
            reader = csv.reader(file)
            for row in reader:
                if self.skip:
                    self.skip = False
                    continue
                obj = {
                    'index': int(row[0]),
                    'change': row[1]
                }
                self.diffRows.append(obj)
        self.numRows = len(self.diffRows)
        self.barValues = [self.maxTimestamp for _ in self.diffRows]
        self.colourValues = [self.colourize(x['change']) for x in self.diffRows]

    def colourize(self, change):
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

    def plot(self):
        fig, ax = plt.subplots()
        ax.barh(range(len(self.barValues)), self.barValues, height=1, color=self.colourValues)
        plt.plot(self.xValues, self.yValues, color='#bbbbbb')
        ax.scatter(self.xValues, self.yValues, zorder=10, s=2)
        plt.xlabel('Relative timestamp (ms)')
        plt.ylabel('Diff line')
        plt.title("Gaze position over time")
        plt.ylim(self.numRows-1, 0)
        plt.xlim(0, self.maxTimestamp)
        plt.savefig(self.path + '/fig.png')


root = 'Graph/'
for subdir in os.listdir(root):
    print("Graphing " + subdir)
    plot = CommitPlot(root + subdir)
    plot.plotSubplots()
    plot.plot()

