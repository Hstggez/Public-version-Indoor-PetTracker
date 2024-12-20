document.addEventListener('DOMContentLoaded', () => {
    const WEBSOCKET_URL = "ws://Redacted:8765"; // Replace with your WebSocket server's URL and port

    let websocket;

    // Function to connect to WebSocket and listen for updates
    function connectToWebSocket() {
        if (websocket && (websocket.readyState === WebSocket.OPEN || websocket.readyState === WebSocket.CONNECTING)) {
            hideConnectingMessage();
            console.log('connection to websocket still on');
            console.warn('WebSocket connection already exists. Skipping reconnection.');
            return; // Exit if connection is still open or in progress
        }
        try {
            // Establish a WebSocket connection
            websocket = new WebSocket(WEBSOCKET_URL);

            // Handle connection open
            websocket.onopen = () => {
                console.log('Connected to WebSocket server');
                hideConnectingMessage();
            };

            // Handle messages received from the server
            websocket.onmessage = (event) => {
                console.log('Message received:', event.data);

                try {
                    const message = JSON.parse(event.data); // Parse the JSON message

                    // Extract position and timestamp
                    const position = message.position;
                    const timestamp = message.timestamp;

                    console.log('Received position:', position, 'Timestamp:', timestamp);

                    // Validate position data
                    if (position && position.xPercentage && position.yPercentage) {
                        plotLocation(position.xPercentage, position.yPercentage); // Update the UI
                    } else {
                        console.warn('Invalid position data received:', position);
                    }
                } catch (err) {
                    console.error('Error parsing WebSocket message:', err);
                }
            };

            // Handle WebSocket errors
            websocket.onerror = (err) => {
                console.error('WebSocket error:', err);
            };

            // Handle WebSocket close
            websocket.onclose = () => {
                console.warn('WebSocket connection closed. Attempting to reconnect in 5 seconds...');
                setTimeout(connectToWebSocket, 5000); // Retry connection after 5 seconds
            };
        } catch (err) {
            console.error('Failed to connect to WebSocket:', err);
        }
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
    // Dynamically add the Content-Security-Policy meta tag
    /*function addCSPMetaTag() {
        const meta = document.createElement('meta');
        meta.setAttribute('http-equiv', 'Content-Security-Policy');
        meta.setAttribute('content', "connect-src 'self' ws://3.20.4.116:8765;"); // Adjust the WebSocket URL accordingly
        document.head.appendChild(meta);
        console.log('CSP Meta Tag added.');
    }*/
    // Show "connecting" message
    function showConnectingMessage() {
        const connectingMessage = document.createElement('div');
        connectingMessage.id = 'connecting-message';
        connectingMessage.textContent = 'Connecting to WebSocket server...';
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
        // Call the function to add the meta tag
        //addCSPMetaTag();
        showConnectingMessage();
        connectToWebSocket(); // Connect to the WebSocket server

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
