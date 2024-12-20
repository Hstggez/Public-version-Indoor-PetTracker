ssh -i "C:\Users\hstba\OneDrive\Desktop\proj\secured\PetTracker_EC2.pem" ec2-user@3.20.4.116
above line is for remote connection using vscode to EC2, REPLACE the address with your pem location


for shutdown server script: use this HTTP request
curl -X POST http://localhost:8080/shutdown
or manually ctrl+c on ssh

Files contained:
	EC2_servercode-->for server
	kmeans.c-->for faster and super efficient c execution of kmeans clustering algorithms
	kmeans--> executable that runs on linux systems compiled by: gcc -lrt kmeansv1.c -o kmeans -lm -lpthread, for more to see: https://github.com/Hstggez/Kmeans