#!/bin/bash

# install node
if ! [type -P nodejs]; then
	curl -sL https://deb.nodesource.com/setup_8.x | sudo -E bash -
fi

sudo apt-get update
sudo apt-get install -y exiftool cifs-utils nodejs chromium graphicsmagick python

npm install



