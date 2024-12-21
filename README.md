This project is designed to be working as a pet location tracker:

Note: the name being public doesn't mean you own the right to plagiarize or copy the entire codbase as your own 
It only means the codebase is cleaned of Sensitive API keys and infos as well as data.



For Device folder: the script is to be installed on WIFI enabled RaspberryPi
For EC2server folder: it contains all the needed code to be installed on EC2
For front end folder: it contains all the files needed for webapp working

In order for all of them to work:
have the iot devices and AWS backend including EC2,IOT core, Lambda, DynamoDB all set-up, 
you must have EC2 working: as in have the cmd line: python3 EC2_servercode.py
					which runs the flask server on EC2 for real time location updates as well as summary feature 
					which runs real time ML kmeans then take its result and send it to the front end
Then: you can just chrome -> open index.html
