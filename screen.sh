#!/bin/bash

if [ "$1" == 'on' ]; then
  tvservice -p;

  chvt 1;
  chvt 2;
  killall chromium;
  echo 'Switched screen on!'
fi

if [ "$1" == 'off' ]; then
  tvservice -o;
  echo 'Switched screen off!'
fi

if [ "$1" == 'status' ]; then
  tvservice -s;
fi
