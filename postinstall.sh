#!/bin/bash

npm list forever -g || sudo npm install -g forever
if [ -f /etc/init.d/node-server.sh ]; then
	echo "node-server.sh already installed"
else
	sudo mv ~/app/node-server.sh /etc/init.d/
	sudo sed -i -e "s/ReplaceWithUser/$USER/g" /etc/init.d/node-server.sh
	cd /etc/init.d
	sudo chmod 755 node-server.sh
	sudo update-rc.d node-server.sh defaults
	cd ~/app
	echo "installed node-server.sh"
fi
if [ -f /usr/bin/screen.sh ]; then
	echo "screen.sh already installed"
#	sudo unlink ~/app/screen.sh
else
	sudo mv ~/app/screen.sh /usr/bin/
	cd /usr/bin
	sudo chmod 755 screen.sh
	cd ~/app
	echo "installed screen.sh"
fi
if [ -f ~/.bash_aliases ]; then
	sudo unlink ~/app/.bash_aliases
fi
sudo mv ~/app/.bash_aliases ~
echo "installed .bash_aliases"
if [ -f /boot/config.txt ]; then
	sudo unlink /boot/config.txt
fi
sudo mv ~/app/config.txt /boot/config.txt
echo "installed /boot/config.txt"
if [ -f /boot/xinitrc ]; then
	sudo unlink /boot/xinitrc
fi
sudo mv ~/app/xinitrc /boot/xinitrc
echo "installed /boot/xinitrc"

if [ -f /etc/rc.local ]; then
	sudo unlink /etc/rc.local
fi
sudo mv ~/app/rc.local /etc/rc.local
sudo chmod 755 /etc/rc.local
echo "installed /etc/rc.local"

echo "finished installing PhotoFrame" 