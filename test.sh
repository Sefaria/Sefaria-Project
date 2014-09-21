#!/bin/bash

#py.test tests
py.test
PYTEST_RESULTS=$?

#Django API tests
python manage.py test reader
API_RESULTS=$?

if [ $PYTEST_RESULTS != 0 ] 
then
	echo "py.test failed"
fi

if [ $API_RESULTS != 0 ]
	then
	echo "Django API tests failed"
fi

if [ $API_RESULTS != 0 ] || [ $PYTEST_RESULTS != 0 ]
then
	exit 1
else
	echo "All tests passed!"
	exit 0
fi
