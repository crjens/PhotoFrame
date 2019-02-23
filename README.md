Photo Frame
=====


Install Instructions
--------------------
1. Start with latest Raspian image from http://downloads.raspberrypi.org/raspbian_latest
2. login to Pi with Putty or other 
3. run 'sudo raspi-config' 
	1. set locale and timezone under internationalisation options
	2. expand filesystem
4. map newtork drive containing photos to /mnt/nas
	1. sudo mkdir /mnt/nas
	2. update /etc/fstab and the following line
		1. //192.168.0.146/photo	/mnt/nas	cifs	username=<user>,password=<password>,vers=1.0	0	0	f
4. Install PhotoFrame software
	1. wget -O - https://raw.githubusercontent.com/crjens/PhotoFrame/install.sh | bash
