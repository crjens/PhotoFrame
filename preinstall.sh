#!/bin/bash

# install node
if [type -P node]; then
	echo "node already installed"
else
	# install node
	curl -sL https://deb.nodesource.com/setup_8.x | sudo -E bash -
	sudo apt-get install -y nodejs
fi
