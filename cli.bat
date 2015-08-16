rem converted cli shell script to bat file
echo off
set PYTHONPATH=%cd%
set DJANGO_SETTINGS_MODULE=sefaria.settings

IF [%1]== [] GOTO P
IF %1== -i  GOTO IP
:IP
ipython -i cli.py
GOTO END
:P
python -i cli.py
:END