// Configure AWS SDK and IoT device
AWS.config.region = 'us-west-2'; // e.g., 'us-west-2'
AWS.config.credentials = new AWS.CognitoIdentityCredentials({
    IdentityPoolId: 'your-identity-pool-id', // Replace with your Cognito Identity Pool ID
});

const clientId = 'mqtt-client-' + (Math.floor((Math.random() * 100000) + 1));

const mqttClient = AWS.IotData({
    endpoint: 'your-iot-endpoint.amazonaws.com', // Replace with your AWS IoT endpoint
});

export function connectToAWSIoT() {
    const options = {
        region: AWS.config.region,
        clientId: clientId,
        accessKeyId: AWS.config.credentials.accessKeyId,
        secretAccessKey: AWS.config.credentials.secretAccessKey,
        sessionToken: AWS.config.credentials.sessionToken,
    };

    const client = mqttClient.connect(options);

    client.on('connect', () => {
        console.log('Connected to AWS IoT');
        hideConnectingMessage();
        client.subscribe('your/topic/path'); // Replace with your topic

        client.on('message', (topic, payload) => {
            console.log('Message received:', payload.toString());
            const data = JSON.parse(payload.toString());
            plotLocation(data.xPercentage, data.yPercentage);
        });
    });

    client.on('error', (err) => {
        console.error('Error connecting to AWS IoT:', err);
        showConnectingMessage();
    });
}

// Function to plot the location on the floor plan
export function plotLocation(xPercentage, yPercentage) {
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
export function showConnectingMessage() {
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
export function hideConnectingMessage() {
    const messageElement = document.getElementById('connecting-message');
    if (messageElement) {
        document.body.removeChild(messageElement);
    }
}

export function initConnect() {
// Initialize AWS IoT connection when the page is loaded
document.addEventListener('DOMContentLoaded', () => {
    showConnectingMessage();
    AWS.config.credentials.get((err) => {
        if (err) {
            console.error('Error retrieving AWS credentials:', err);
            showConnectingMessage();
        } else {
            connectToAWSIoT();
        }
    });
});
}
