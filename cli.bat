rem converted cli shell script to bat file
echo off
set PYTHONPATH=%cd%
set DJANGO_SETTINGS_MODULE=sefaria.settings

IF [%1]== [] GOTO P
IF %1== -i  GOTO IP
python -i cli.py 
EXIT
:P
python -i cli.py
exit
:ip
ipython -i cli.py