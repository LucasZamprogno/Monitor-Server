# Core-Server
Very simple rest server to receive data from the [chrome extension](https://github.com/LucasZamprogno/GitHub-Monitor) and save it. There are only two endpoints: get/echo for testing and post/data for event data. Files are saved as .txt files where each line is a stringified JSON object. The only other job done when receiving data is to detect if the page the event was generated on has changed. It does this because if the content script is unloaded on page 'A' and loaded again on page 'B' and begins reporting, it has no knowledge that 'A' was the previous page, or if there are any other copies of the content script running on other pages.

The server is currently being expanded to do analysis/grouping on the data.
