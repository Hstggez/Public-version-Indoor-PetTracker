document.addEventListener('DOMContentLoaded', () => {
    const WEBSOCKET_URL = "ws://3.20.4.116:8765"; // Replace with your WebSocket server's URL and port
    let Reconnectiontimer=0;
    const MAX_RECONNECTION=20;
    let Summary_yes=0;
    let websocket,websocket2;
    let connect_state=false;
    function connectToWebSocketWithRoute(){
        if (websocket2 && (websocket2.readyState === WebSocket.OPEN || websocket2.readyState === WebSocket.CONNECTING)) {
            hideAllConnectingMessages();
            console.log('connection to websocket still on');
            console.warn('WebSocket connection already exists. Skipping reconnection.');
            return; // Exit if connection is still open or in progress
        }
        try {
            let URL =WEBSOCKET_URL+'/';
            websocket2 = new WebSocket(URL);
        } catch (err) {
            console.error('Failed to connect to WebSocket2:', err);
        }
    }

    function ResetAllState(){
        Summary_yes=0;
        Reconnectiontimer=0;
        connect_state=false;
        hideAllConnectingMessages();
    }
    // Function to connect to WebSocket and listen for updates
    function connectToWebSocket(route='') {
        let connection_present=0;
        if(!connect_state){
            ResetAllState();
            return;
        }
        if (websocket && (websocket.readyState === WebSocket.OPEN || websocket.readyState === WebSocket.CONNECTING)) {
            //hideAllConnectingMessages();
            console.log('connection to websocket still on');
            console.warn('WebSocket connection already exists. Skipping reconnection.');
            showmsg("Backend Connected: waiting for updates");
            connection_present=1; // Exit if connection is still open or in progress
        }
        try {
            if(!connection_present){
                let URL =WEBSOCKET_URL+route;
                websocket = new WebSocket(URL);
            }
            websocket.onopen = () => {
                console.log('Connected to WebSocket server');
                //hideAllConnectingMessages();
                showmsg("Backend Connected: waiting for updates");
                if(Summary_yes){
                    websocket.send("trigger_summary");
                }
            };

            websocket.onmessage = (event) => {
                //console.log('Message received:', event.data);
                try {
                    hideAllConnectingMessages();
                    const message = JSON.parse(event.data);
                    if (message.event === "summary_result"){//make sure message if for location updates
                        renderSummaryPage();
                        return;
                    }
                    const position = message.position;
                    const timestamp = message.timestamp;

                    console.log('Received position:', position, 'Timestamp:', timestamp);

                    if (position && position.xPercentage && position.yPercentage) {
                        plotLocation(position.xPercentage, position.yPercentage);
                    } else {
                        console.warn('Invalid position data received:', position);
                    }
                } catch (err) {
                    console.error('Error parsing WebSocket message:', err);
                     (err);

                }
            };

            websocket.onerror = (err) => {
                console.error('WebSocket error:', err);
                showErrormsg(err);
            };

            websocket.onclose = () => {
                console.warn('WebSocket connection closed. Attempting to reconnect in 1 seconds...');
                showmsg('WebSocket connection closed. Attempting to reconnect in 1 seconds...');
                console.log(Reconnectiontimer);
                setTimeout(()=>{

                    if(Reconnectiontimer<MAX_RECONNECTION-1){
                        ++Reconnectiontimer;
                        showmsg('Attempting to reconnect');

                        connectToWebSocket();
                    }
                    else{
                        showmsg(`Had been trying to connect for ${MAX_RECONNECTION}s, service might be temporarily unavailable`);
                        Reconnectiontimer=0;
                    }

                 }, 1000);
            };
        } catch (err) {
            console.error('Failed to connect to WebSocket:', err);

            showErrormsg(err);
        }
    }

    function plotLocation(xPercentage, yPercentage) {
        const floorplanContainer = document.getElementById('floorplan-container');
        const locationDot = document.getElementById('location-dot');

        const xPos = floorplanContainer.clientWidth * (xPercentage / 100);
        const yPos = floorplanContainer.clientHeight * (yPercentage / 100);

        locationDot.style.left = `${xPos}px`;
        locationDot.style.top = `${yPos}px`;
        locationDot.style.display = 'block';
    }

    function renderInitialPage() {
        ResetAllState(); //force hide connection msg
        document.body.classList.remove('blur', 'text-blur');
        document.body.style.backgroundImage = "url('./background.jpg')";
        document.body.style.backgroundColor = '';

        document.body.innerHTML = `
            <button id="begin-button">Begin the journey</button>
        `;

        const button = document.getElementById('begin-button');
        button.addEventListener('mouseenter', () => {
            document.body.classList.add('blur', 'text-blur');
        });

        button.addEventListener('mouseleave', () => {
            document.body.classList.remove('blur', 'text-blur');
        });

        button.addEventListener('click', () => {
            document.body.classList.remove('blur', 'text-blur');
            document.body.style.transition = 'background-color 3s ease';
            document.body.style.backgroundColor = '#f7f4e9';
            document.body.style.backgroundImage = 'none';
            showLoadingScreen(()=>{renderFloorPlanPage();},1.5,'Retrieving..');

        });
    }

    function renderFloorPlanPage() {
        connect_state=true;
        Summary_yes=0;
        document.body.style.backgroundColor = '#f7f4e9';
        document.body.style.filter = 'blur(0px)';
        document.body.innerHTML = `
            <h1 id="floorplan-text">Floor Plan Location Plotter</h1>
            <div id="floorplan-container" style="position: relative;">
                <img id="floorplan" src="floorplan1.png" alt="Floor Plan" style="width: 100%;">
                <div id="location-dot" class="dot" style="display: none; position: absolute; width: 10px; height: 10px; background-color: red; border-radius: 50%;"></div>
            </div>
            <button id="summary-button" style="margin: 10px;">Summary</button>
            <button id="back-button" style="margin: 10px;">Back</button>
        `;




        // Summary button event listener
        document.getElementById('summary-button').addEventListener('click', () => {
            renderSummaryPage();
        });

        // Back button event listener
        document.getElementById('back-button').addEventListener('click', () => {
            document.body.style.transition = 'background-color 3s ease';
            document.body.style.backgroundColor = '';
            document.body.style.backgroundImage = "url('./background.jpg')";
            showLoadingScreen(()=>{renderInitialPage();},1,'Like the experience?');

        });
        showConnectingMessage();
        connectToWebSocket();
    }

    function renderSummaryPage() {
        connect_state=true;
        let ele=null;
        ele=showLoadingScreen(null,1,"Communicating with the server",true);
        Summary_yes=1;
        //console.log(ele);


        if (websocket && (websocket.readyState === WebSocket.OPEN)||(websocket.readyState === WebSocket.CONNECTING) )
        {
            //console.warn('WebSocket connection already exists. Skipping reconnection.');
            console.log("WebSocket still connected for the summary");

            if(websocket.readyState === WebSocket.OPEN){
                ele=showLoadingScreen(null,1,"Server is connected, waiting for info",true);
                document.body.removeChild(ele);
                //console.log(ele);
                websocket.send("trigger_summary");
                console.log("trigger_summary sent");
            }
        }

        else{
            //ele=showLoadingScreen(null,1,"Server is connected, waiting for info",true);
            //document.body.removeChild(ele);
            connectToWebSocket();

        }    



        websocket.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data); // Parse incoming JSON message
                //console.log("Message from server:", message);

                if (message.event === "summary_result" && message.status === "success") {
                    const kmeansSummary = message.data.kmeans_summary;
                    const csvSummary = message.data.csv_summary;
                    if(document.body.contains(ele)){
                        document.body.removeChild(ele);
                    }
                    // Set up HTML
                    document.body.innerHTML = `
                        <h1 id="summary-title" style="text-align: center;">Your Pet's Insights!</h1>
                        <div id="summary-container" style="text-align: center;">
                            <canvas id="elbow-chart" style="display: block; margin: 20px auto; width: 800px; height: 400px;"></canvas>
                            <h3>
                                Theoreticaly best spots: ${kmeansSummary.theoretical_best} <br>
                                Number of Your pet's Most visited spots! (Elbow Point): ${kmeansSummary.elbow}
                            </h3>
                        </div>
                        <div id="floorplan-container" style="position: relative; width: 800px; margin: auto;">
                            <img id="floorplan" src="floorplan1.png" alt="Floor Plan" style="width: 100%; display: block;">
                        </div>

                        <button id="back-to-floorplan" style="margin: 10px auto; display: block;">Back to Tracking</button>
                    `;
    
                    // Plot Elbow Graph
                    plotElbowGraph(kmeansSummary.wcss_values, kmeansSummary.elbow);
    
                    // Highlight Centroids as Heatmap
                    plotCentroids(csvSummary,kmeansSummary.centroids);
    
                    // Back to floorplan functionality
                    document.getElementById('back-to-floorplan').addEventListener('click', () => {
                        renderFloorPlanPage();
                    });
                }
            } catch (err) {
                console.error("Failed to parse server message:", err);
                showErrormsg(err);
            }
        };
    }
    
    function plotElbowGraph(wcssValues, elbowPoint) {
        const canvas = document.getElementById("elbow-chart");
    
        // Dynamically control canvas size
        canvas.style.width = "800px";
        canvas.style.height = "400px";
        canvas.width = 800;
        canvas.height = 400;
    
        const ctx = canvas.getContext("2d");
    
        // Normalize WCSS values to prevent extreme scaling issues
        const maxWCSS = Math.max(...wcssValues.map(item => item.wcss));
        const normalizedYValues = wcssValues.map(item => item.wcss / maxWCSS * 100); // Scale to 0-100%
    
        const xValues = wcssValues.map(item => item.k);
    
        new Chart(ctx, {
            type: "line",
            data: {
                labels: xValues,
                datasets: [{
                    label: "WCSS (Within-Cluster Sum of Squares)",
                    data: normalizedYValues, // Normalized data for plotting
                    borderColor: "blue",
                    backgroundColor: "rgba(0, 0, 255, 0.1)",
                    pointBackgroundColor: xValues.map(k => (k === elbowPoint) ? "red" : "blue"),
                    pointRadius: xValues.map(k => (k === elbowPoint) ? 8 : 5),
                    borderWidth: 2,
                    tension: 0.3
                }]
            },
            options: {
                responsive: false,
                maintainAspectRatio: false,
                plugins: {
                    tooltip: {
                        callbacks: {
                            // Custom tooltip to show raw WCSS values
                            label: function(context) {
                                const index = context.dataIndex;
                                const rawValue = wcssValues[index].wcss; // Raw WCSS value
                                return `WCSS: ${rawValue}`;
                            }
                        }
                    },
                    title: {
                        display: true,
                        text: "Elbow Method for Determining Optimal k",
                        font: { size: 18 }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: "Normalized WCSS (%)" }
                    },
                    x: {
                        title: { display: true, text: "Number of Clusters (k)" }
                    }
                }
            }
        });

    }


    function plotCentroids(csvSummary, centroids) {
        const container = document.getElementById("floorplan-container");
        const containerWidth = container.offsetWidth;
        const containerHeight = container.offsetHeight;
    
        const MAX_RADIUS = 100; // Maximum radius in pixels for visual clarity
    
        // Helper: Calculate distance between two points
        function calculateDistance(x1, y1, x2, y2) {
            return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
        }
    
        // Group points by closest centroid
        const pointsPerCentroid = centroids.map(() => []);
        csvSummary.forEach((point) => {
            let closestCentroid = 0;
            let minDistance = Infinity;
    
            centroids.forEach((centroid, index) => {
                const distance = calculateDistance(
                    centroid.x,
                    centroid.y,
                    point.xPercentage,
                    point.yPercentage
                );
                if (distance < minDistance) {
                    closestCentroid = index;
                    minDistance = distance;
                }
            });
    
            pointsPerCentroid[closestCentroid].push(point);
        });

        // Total number of points in the dataset
        //const totalPoints = pointsPerCentroid.reduce((acc, points) => acc + points.length, 0);
        const totalPoints=csvSummary.length;
        // Calculate radii for centroids based on the proportion of points
        const radii = centroids.map((_, index) => {
            const pointCount = pointsPerCentroid[index].length;

            // Ensure we avoid division by zero
            if (totalPoints === 0) {
                    console.warn("No points in the dataset!");
                    return 0;
            }

            // Calculate radius as proportion of points
            const radius = (pointCount / totalPoints) * MAX_RADIUS;

            // Log for debugging
            //console.log(`Centroid ${index}: pointCount = ${pointCount}, radius = ${radius}`);

            return radius*2;
        });

        //const colors=getCentroidColorsRand();
        const colors1=getCentroidColorsRand();
        // Plot centroids with adjusted radius and opacity
        centroids.forEach((centroid, index) => {
            //const pointCount = pointsPerCentroid[index].length;
            const opacity = Math.min(0.9, 1-(radii[index]/100) ); // Adjust opacity based on point count
            const color = colors1[index % 10];
            //console.log(color);
            const dot = document.createElement("div");
            dot.style.position = "absolute";
            dot.style.left = `${(centroid.x / 100) * containerWidth - radii[index]}px`;
            dot.style.top = `${(centroid.y / 100) * containerHeight - radii[index]}px`;
            dot.style.width = `${radii[index] * 2}px`;
            dot.style.height = `${radii[index] * 2}px`;
            dot.style.backgroundColor = color;
            dot.style.opacity = opacity.toFixed(2); // Set opacity
            dot.style.borderRadius = "50%";
            //dot.style.border = "2px solid black";
            container.appendChild(dot);
        });

        pointsPerCentroid.forEach((centroid,index)=>{
            //const ratio=centroid.length/totalPoints;
            const color = colors1[index % 10];

            centroid.forEach((point) => {
                const containerWidth = container.offsetWidth;
                const containerHeight = container.offsetHeight;

                const dot = document.createElement("div");
                // Make position relative to parent
                dot.style.position = "absolute";
                // Position dot relative to container's width and height
                dot.style.left = `${(point.xPercentage / 100) * containerWidth}px`;
                dot.style.top = `${(point.yPercentage / 100) * containerHeight}px`;
                // Scale dot size based on container size
                const dotSize = Math.min(containerWidth, containerHeight) * 0.01; // Adjust scaling factor (0.01) as needed
                dot.style.width = `${dotSize}px`;
                dot.style.height = `${dotSize}px`;
                // Style the dot
                dot.style.backgroundColor = color;
                dot.style.borderRadius = "50%";
                // Append to container
                container.appendChild(dot);
                //plotLocation(point.xPercentage,point.yPercentage);
            });


        });


    }

    function getCentroidColorsRand() {
        const colors = [];
        const colorCount = 10; // Ensure at least 10 colors
        const hueStep = 360 / colorCount; // Evenly distribute hues
    
        for (let i = 0; i < colorCount; i++) {
            const hue = i * hueStep; // Evenly spaced hues
            const saturation = 60 + Math.random() * 20; // Randomize saturation between 60% and 80%
            const lightness = 50 + Math.random() * 10; // Randomize lightness between 50% and 60%
            colors.push(`hsl(${hue.toFixed(0)}, ${saturation.toFixed(0)}%, ${lightness.toFixed(0)}%)`);
        }
    
        return colors;
    }

    async function showmsg(msg){
        hideAllConnectingMessages();
        const connectingMessage = document.createElement('div');
        connectingMessage.id = 'connecting-message';
        connectingMessage.textContent = msg;
        connectingMessage.style.position = 'absolute';
        connectingMessage.style.top = '10px';
        connectingMessage.style.left = '50%';
        connectingMessage.style.transform = 'translateX(-50%)';
        connectingMessage.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
        connectingMessage.style.padding = '10px';
        connectingMessage.style.borderRadius = '5px';

        document.body.appendChild(connectingMessage);
    }


    function showErrormsg(err){
        const errorMessage = err && err.message ? err.message : String(err);

        showmsg(`Failed to connect to WebSocket: ${errorMessage}`, errorMessage);
    }

    function showConnectingMessage() {
        showmsg("Connecting to the backend");
    }

    function hideAllConnectingMessages() {
        const elements = document.querySelectorAll('#connecting-message'); // Returns a NodeList of all matching elements
        elements.forEach(element => {
            element.parentNode.removeChild(element); // Remove each element
        });
    }


    //Loading Screen
    function showLoadingScreen(callback=null, seconds = 2, message = 'Loading...',arg=false) {
        // Create the loading screen element
        const loadingScreen = document.createElement('div');
        loadingScreen.id = 'loading-screen';
        loadingScreen.style.position = 'fixed';
        loadingScreen.style.top = '0';
        loadingScreen.style.left = '0';
        loadingScreen.style.width = '100%';
        loadingScreen.style.height = '100%';
        loadingScreen.style.backgroundColor = '#f0f0f0';
        loadingScreen.style.display = 'flex';
        loadingScreen.style.justifyContent = 'center';
        loadingScreen.style.alignItems = 'center';
        loadingScreen.style.fontSize = '2em';
        loadingScreen.style.fontWeight = 'bold';
        loadingScreen.style.color = '#aaa'; // Default grayish-black
        loadingScreen.style.zIndex = '9999';
    
        // Create a container for animated text
        const animatedText = document.createElement('div');
        animatedText.id = 'animated-text';
        animatedText.style.display = 'inline-block';
        animatedText.style.overflow = 'hidden';
    
        // Split the message into individual letters
        message.split('').forEach((letter, index) => {
            const span = document.createElement('span');
            span.textContent = letter === ' ' ? '\u00A0' : letter; // Handle spaces with non-breaking space
            span.style.color = '#aaa'; // Default grayish-black
            span.style.transition = 'color 0.2s ease';
            span.style.display = 'inline-block';
    
            // Apply animation only if it's not a space
            if (letter !== ' ') {
                span.style.animation = `letter-highlight ${message.length * 0.15}s infinite ${index * 0.15}s`;
            }
    
            // Append each span to the text container
            animatedText.appendChild(span);
        });
    
        // Append the animated text to the loading screen
        loadingScreen.appendChild(animatedText);
        document.body.appendChild(loadingScreen);
    
        // Remove the loading screen after the specified seconds and call the callback function

        setTimeout(() =>
        {
            if(arg==false){
            document.body.removeChild(loadingScreen);
            if (typeof callback === 'function') {
                callback();
            }
            }

        }, seconds * 1000);


        return loadingScreen;

    }


    function updateDotPositions(dots, container) {
        const containerWidth = container.offsetWidth;
        const containerHeight = container.offsetHeight;
      
        dots.forEach((dot, index) => {
          const point = dot.dataset; // Assuming dot position data is stored in dataset
          dot.style.left = `${(point.xPercentage / 100) * containerWidth}px`;
          dot.style.top = `${(point.yPercentage / 100) * containerHeight}px`;
        });
      }
      
      window.addEventListener('resize', () => {
        const container = document.getElementById('container');
        if (container) {
            const dots = document.querySelectorAll('.dot');
            updateDotPositions(dots, container);
        }
    });


    // Add keyframes for the animation
    const style = document.createElement('style');
    style.textContent = `
    @keyframes letter-highlight {
        0% { color: #aaa; }
        50% { color: #000; }
        100% { color: #aaa; }
    }
    `;
    document.head.appendChild(style);


    renderInitialPage();
});
