//import {connectToAWSIoT,initConnect} from './script.js';

// Configure AWS SDK and IoT device
AWS.config.region = 'us-east-2'; // e.g., 'us-west-2'
AWS.config.credentials = new AWS.CognitoIdentityCredentials({
    IdentityPoolId: 'us-east-2:REDACTED', // Replace with your Cognito Identity Pool ID
});

const clientId = 'mqtt-client-' + Math.random().toString(16).substring(2, 8)

// Use `new` with AWS.IotData
/*const mqttClient = new AWS.IotData({
    endpoint: 'Redacted.iot.us-east-2.amazonaws.com', // Replace with your AWS IoT endpoint
});*/
const iotEndpoint='Redacted.iot.us-east-2.amazonaws.com';


function connectToAWSIoT() {
    if (!AWS.config.credentials || !AWS.config.credentials.accessKeyId) {
        console.error('AWS Credentials are not configured properly');
        return;
    }

    try {
        // Create the request for the AWS IoT WebSocket URL
        const request = new AWS.HttpRequest(`https://${iotEndpoint}/mqtt`, AWS.config.region);
        request.method = 'GET';
        request.headers['host'] = iotEndpoint;

        // Sign the request
        const signer = new AWS.Signers.V4(request, 'iotdevicegateway');
        signer.addAuthorization(AWS.config.credentials, AWS.util.date.getDate());

        // Construct the signed URL
        const signedUrl = `wss://${request.headers['host']}${request.path}?${request.search()}`;
        console.log('Signed WebSocket URL:', signedUrl);

        // MQTT Connection Options
        const options = {
            clientId: `mqtt-client-${Math.random().toString(16).substr(2, 8)}`, // Unique client ID
            protocol: 'wss', // WebSocket protocol
            keepalive: 60,
            clean: true,
            username: AWS.config.credentials.accessKeyId, // Include accessKeyId as username
            secretAccessKey: AWS.config.credentials.secretAccessKey,
            password: AWS.config.credentials.sessionToken, // Include sessionToken as password
        };


        // Connect to AWS IoT MQTT
        const mqttClient = mqtt.connect(signedUrl, options);


        mqttClient.on('connect', () => {
            console.log('Connected to AWS IoT');
            hideConnectingMessage();
    
            // Subscribe to a topic
            mqttClient.subscribe('locations/update', (err) => {
                if (err) {
                    console.error('Subscription error:', err);
                } else {
                    console.log('Subscribed to topic: locations/update');
                }
            });
        });
    
        mqttClient.on('message', (topic, payload) => {
            console.log(`Message received on topic ${topic}:`, payload.toString());
            const data = JSON.parse(payload.toString());
            if (data.xPercentage && data.yPercentage) {
                plotLocation(data.xPercentage, data.yPercentage);
            }
        });




        mqttClient.on('error', (err) => {
            console.error('MQTT Error:', err);
        });

        mqttClient.on('close', () => {
            console.warn('MQTT Connection Closed');
        });

        mqttClient.on('offline', () => {
            console.warn('MQTT Client Offline');
        });



        return mqttClient;
    } catch (err) {
        console.error('Error during connection:', err);
    }
}


function initConnect() {
    // Initialize AWS IoT connection when the page is loaded

    showConnectingMessage();
    AWS.config.credentials.get((err) => {
    if (err) {
        console.error('Error retrieving AWS credentials:', err);
        showConnectingMessage();
    } else {
        console.log('credentials are correct: connecting');
        console.log('AWS Credentials:', AWS.config.credentials);
        connectToAWSIoT();
    }
    });

}


function plotLocation(xPercentage, yPercentage) {
    const floorplanContainer = document.getElementById('floorplan-container');
    const locationDot = document.getElementById('location-dot');

    // Calculate position based on the container size
    const xPos = floorplanContainer.clientWidth * (xPercentage / 100);
    const yPos = floorplanContainer.clientHeight * (yPercentage / 100);

    // Set the position and make the dot visible
    locationDot.style.left = `${xPos}px`;
    locationDot.style.top = `${yPos}px`;
    locationDot.style.display = 'block';
}

// Show "connecting" message
function showConnectingMessage() {
    const connectingMessage = document.createElement('div');
    connectingMessage.id = 'connecting-message';
    connectingMessage.textContent = 'Connecting to server...';
    connectingMessage.style.position = 'absolute';
    connectingMessage.style.top = '10px';
    connectingMessage.style.left = '50%';
    connectingMessage.style.transform = 'translateX(-50%)';
    connectingMessage.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
    connectingMessage.style.padding = '10px';
    connectingMessage.style.borderRadius = '5px';
    document.body.appendChild(connectingMessage);
}

// Hide "connecting" message
function hideConnectingMessage() {
    const messageElement = document.getElementById('connecting-message');
    if (messageElement) {
        document.body.removeChild(messageElement);
    }
}

// Simulate listening for updates from AWS (replace this with actual AWS logic)
/*function listenForUpdates() {
    showConnectingMessage();

    client.onMessageArrived = (message) => {
        console.log("Message received:", message.payloadString);
        const data = JSON.parse(message.payloadString);

        if (data.xPercentage && data.yPercentage) {
            plotLocation(data.xPercentage, data.yPercentage);
        }
    };
}*/


document.addEventListener('DOMContentLoaded', () => {
    // Apply initial background image (e.g., cat-themed background)
    document.body.style.backgroundImage = "url('./background.jpg')"; // Replace with your image path

    // Function to render the initial "Begin the journey" page
    function renderInitialPage() {
        document.body.classList.remove('blur', 'text-blur'); // Ensure no blur is applied initially
        document.body.style.backgroundImage = "url('./background.jpg')"; // Restore background image
        document.body.style.backgroundColor = ''; // Reset color to use the image

        document.body.innerHTML = `
            <button id="begin-button">Begin the journey</button>
        `;

        // Get the button element
        const button = document.getElementById('begin-button');

        // Add hover event listeners to the button
        button.addEventListener('mouseenter', () => {
            document.body.classList.add('blur', 'text-blur'); // Apply blur classes on hover
        });

        button.addEventListener('mouseleave', () => {
            document.body.classList.remove('blur', 'text-blur'); // Remove blur classes when not hovering
        });

        // Add event listener to the "Begin the journey" button to load the floor plan page
        button.addEventListener('click', () => {
            document.body.classList.remove('blur', 'text-blur'); // Ensure blur is removed
            document.body.style.transition = 'background-color 3s ease'; // Smooth transition for background color
            document.body.style.backgroundColor = '#f7f4e9'; // Transition to the specified color
            document.body.style.backgroundImage = 'none'; // Remove background image
            renderFloorPlanPage();
        });
    }

    // Function to render the floor plan page with a back button
    function renderFloorPlanPage() {
        document.body.style.backgroundColor = '#f7f4e9'; // Set solid background color
        document.body.style.filter = 'blur(0px)'; // Ensure no blur on floor plan page
        document.body.innerHTML = `
            <h1 id="floorplan-text">Floor Plan Location Plotter</h1>
            <div id="floorplan-container">
                <img id="floorplan" src="floorplan1.png" alt="Floor Plan" style="width: 100%;">
                <div id="location-dot" class="dot" style="display: none; position: absolute; width: 10px; height: 10px; background-color: red; border-radius: 50%;"></div>
            </div>
            <button id="back-button">Back</button>
        `;
        initConnect();
        //listenForUpdates(); // Keep this function call for additional functionality



        // Add event listener to the "Back" button
        document.getElementById('back-button').addEventListener('click', () => {
            document.body.style.transition = 'background-color 3s ease'; // Smooth transition for returning
            document.body.style.backgroundColor = ''; // Reset to default background color
            document.body.style.backgroundImage = "url('./background.jpg')"; // Restore background image
            renderInitialPage();
        });
    }

    // Render the initial page on load
    renderInitialPage();
});
