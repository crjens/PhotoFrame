#!/bin/bash

ASK_TO_REBOOT=0

# update OS
echo '>>> Update OS Image'
sudo apt-get update
sudo apt-get -y upgrade

# install nodejs via nvm
echo '>>> Install NodeJs'
wget -qO- https://raw.githubusercontent.com/creationix/nvm/v0.34.0/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion
nvm install --lts
sudo cp -R $NVM_DIR/versions/node/$(nvm version)/* /usr/local/

# install required packages
echo '>>> Install packages'
sudo apt-get install -y git exiftool cifs-utils nodejs chromium-browser graphicsmagick python

# install and configure Photoframe
if [ ! -d "app" ]; then
    echo '>>> Installing PhotFrame'
    git clone https://github.com/crjens/PhotoFrame.git app
    cd app
	npm install
    ASK_TO_REBOOT=1
else
    echo '>>> PhotFrame already installed'
fi
 
echo '>>> PhotFrame is installed'
if [ $ASK_TO_REBOOT -ne 0 ]; then
    echo '>>> Restarting...'
    sudo reboot
fi

exit 0



