import csv
import os
from flask import Flask, request, jsonify,render_template
from flask_socketio import SocketIO, emit,send
from flask_sock import Sock

import asyncio
import websockets
import json
import signal
import sys
import subprocess
from threading import Lock



shared_state_lock = Lock()


app = Flask(__name__)
#socketio = SocketIO(app, cors_allowed_origins="null") #for testing on file only, if webpage deployed, change this to domain
#sock = Sock(app)

# WebSocket Configuration
WS_PORT = 8765
connected_clients = set()
DEFAULT_POWER = -33 #if bad change to -40

OUTPUT_FILE="clusters.dat"
CSV_FILE_PATH = "./triangulation_results.csv"
KMEANS_EXECUTABLE = "./kmeans"  

# Fixed points A, B, C (positions on a 2D plane)
FIXED_POINTS = {
    "A": {"x": 30, "y": 25},
    "B": {"x": 85, "y": 5},
    "C": {"x": 86, "y": 30},
}

# Map device IDs to fixed points
DEVICE_ID_TO_POINT = {
    "raspi-1": "A",
    "raspi-2": "B",
    "raspi-3": "C",
}

# Shared state
shared_state = {
    "CURRENT_TS": -1,
    "A_rssi": -DEFAULT_POWER,
    "B_rssi": -DEFAULT_POWER,
    "C_rssi": -DEFAULT_POWER,
    "a_here": -1,
    "b_here": -1,
    "c_here": -1,
    "x_buffer":-DEFAULT_POWER,
    "y_buffer":-DEFAULT_POWER,
    "TXPOWER": -28,
    "N_ponent": 2
}


 
def initialize_csv():
    if not os.path.exists(CSV_FILE_PATH):
        # Create the CSV file with a header if it doesn't exist
        with open(CSV_FILE_PATH, mode="w", newline="") as file:
            writer = csv.writer(file)
            writer.writerow(["timestamp", "xPercentage", "yPercentage"])  # Header row
        print("cvs does not exist,cvs created")
    else:
        # Check if the CSV file exceeds 10,000 entries
        with open(CSV_FILE_PATH, mode="r", newline="") as file:
            reader = list(csv.reader(file))  # Read all rows into memory
            header = reader[0]  # Extract the header row
            rows = reader[1:]   # Exclude the header row

        if len(rows) > 10000:
            print("cvs too big, truncated")
            # Retain only the last 300 entries
            rows = rows[-300:]
            # Rewrite the file with the header and truncated rows
            with open(CSV_FILE_PATH, mode="w", newline="") as file:
                writer = csv.writer(file)
                writer.writerow(header)  # Write the header
                writer.writerows(rows)   # Write the last 300 rows
        else:
            print("internal cvs detected!")
# Function to append triangulation results to CSV
def append_to_csv(timestamp, x_percentage, y_percentage):
    try:
        with open(CSV_FILE_PATH, mode="a", newline="") as file:
            writer = csv.writer(file)
            writer.writerow([timestamp, x_percentage, y_percentage])
        return True  # Append succeeded
    except Exception as e:
        print(f"Error appending to CSV: {e}")
        return False  # Append failed



#take avg of the curr val and the stored val since timestamp missmatch
def temporal_adjust(num,adjust):
    return  (num+adjust)/2

def adjust_to_temp(value_percentage, temp, default_power, threshold=5):
    """
    Recursively adjust a percentage value to make it <= 100 and closer to temp.
    If temp is close to 100 (>= threshold), uses -default_power instead of temp.

    Args:
        value_percentage (float): The raw percentage value to adjust.
        temp (float): A target adjustment value to bias the final result.
        default_power (float): The default power for modular reduction.
        threshold (float): Threshold for temp to switch adjustment logic.

    Returns:
        float: The adjusted percentage value.
    """
    # Base case: Stop when value_percentage is <= 100
    if value_percentage <= 100:
        return value_percentage
    val = (value_percentage % (-default_power)) + temp
    # Check if temp is close to 100
    if val >= 100:
        # Use -default_power for adjustment
        value_percentage = (value_percentage % (-default_power)) + temp -threshold
    else:
        # Use temp for adjustment
        value_percentage = (value_percentage % (-default_power)) + temp

    # Recursive call to continue adjustment
    return adjust_to_temp(value_percentage, temp, default_power, threshold)


def perform_triangulation(a_rssi, b_rssi, c_rssi):
    """Perform trilateration using RSSI data."""
    def rssi_to_distance(rssi):
        """Convert RSSI to distance using a simplified propagation model."""
        TxPower = shared_state["TXPOWER"]
        n = shared_state["N_ponent"] # Path-loss exponent
        return 10 ** ((TxPower - rssi) / (10 * n))

    # Convert RSSI to distances
    dA = rssi_to_distance(a_rssi)
    dB = rssi_to_distance(b_rssi)
    dC = rssi_to_distance(c_rssi)

    # Coordinates of fixed points A, B, and C
    xA, yA = FIXED_POINTS["A"]["x"], FIXED_POINTS["A"]["y"]
    xB, yB = FIXED_POINTS["B"]["x"], FIXED_POINTS["B"]["y"]
    xC, yC = FIXED_POINTS["C"]["x"], FIXED_POINTS["C"]["y"]

    # Trilateration formulas
    W = dA**2 - dB**2 - xA**2 - yA**2 + xB**2 + yB**2
    Z = dB**2 - dC**2 - xB**2 - yB**2 + xC**2 + yC**2

    try:
        denominator = 2 * ((xB - xA) * (yC - yB) - (xC - xB) * (yB - yA))
        if denominator == 0:
            raise ValueError("Invalid fixed points configuration causing division by zero")
        xP = (W * (yC - yB) - Z * (yB - yA)) / denominator
        yP = (W - 2 * xP * (xB - xA)) / (2 * (yB - yA))
    except ZeroDivisionError:
        raise ValueError("Division by zero in trilateration calculation")
    xP_percentage = (xP / 100) * 100
    yP_percentage = (yP / 100) * 100
    if xP_percentage <0:
        xP_percentage=-xP_percentage
    if yP_percentage<0:
        yP_percentage=-yP_percentage
    xP_percentage=adjust_to_temp(xP_percentage,shared_state["x_buffer"],DEFAULT_POWER,5)
    yP_percentage=adjust_to_temp(yP_percentage,shared_state["y_buffer"],DEFAULT_POWER,5)

    return {"xPercentage": xP_percentage, "yPercentage": yP_percentage}


async def broadcast_to_websockets(data):
    """Broadcast data to all WebSocket clients."""
    message = json.dumps(data)
    for client in connected_clients:
        try:
            await client.send(message)
        except Exception as e:
            print(f"Error sending message to client: {e}")
            connected_clients.remove(client)
    print(f"Broadcasted via WebSocket: {message}")


#async def websocket_handler(websocket, path):
async def websocket_handler(websocket):
    """Handle WebSocket connections."""
    connected_clients.add(websocket)
    print("Client connected")
    try:
        async for message in websocket:  # Listen for incoming messages
            print(f"Message received: {message}")
            if message == "trigger_summary":
                # Trigger summary function and send the result back
                summary_result = calculate_summary()  # Call your summary function
                await websocket.send(summary_result)  # Send the summary result back
                print("Message sent successfully")
            else:
                print(f"Unknown message: {message}")

        await websocket.wait_closed()  # Wait until the client closes the connection
    except Exception as e:
        print(f"Error with WebSocket connection: {e}")
    finally:
        connected_clients.remove(websocket)
        print("Client disconnected")


def summarize_csv_data(file_path):
    """
    Reads the CSV file and converts all rows into JSON format.
    Each row contains timestamp, xPercentage, and yPercentage.
    """
    try:
        data = []
        with open(file_path, "r") as csv_file:
            reader = csv.DictReader(csv_file)  # Read CSV as dictionary
            for row in reader:
                data.append({
                    "timestamp": int(row["timestamp"]),
                    "xPercentage": float(row["xPercentage"]),
                    "yPercentage": float(row["yPercentage"])
                })

        
        return data
        

    except Exception as e:
        print(f"Error reading CSV file: {e}")
        return {
            "status": "error",
            "message": str(e)
        }


def summary_json():
    try:
        centroids = []
        wcss_values = []
        theoretical_best = None
        elbow = None

        # Read and parse the output file
        with open(OUTPUT_FILE, "r") as file:
            for line in file:
                line = line.strip()
                if line.startswith("Centroid"):
                    parts = line.split(":")[1].split(",")
                    centroids.append({
                        "centroid_id": int(line.split()[1].strip(":")),
                        "x": float(parts[0].strip()),
                        "y": float(parts[1].strip())
                    })
                elif line.startswith("k ="):
                    parts = line.split(",")
                    wcss_values.append({
                        "k": int(line.split("=")[1].split(",")[0].strip()),
                        "wcss": float(parts[1].split("=")[1].strip())
                    })
                elif "theoretical_best" in line:
                    theoretical_best = int(line.split("=")[1].split(",")[0].strip())
                    elbow = int(line.split("=")[2].strip())

        # Structure the data
        result = {
            "centroids": centroids,
            "wcss_values": wcss_values,
            "theoretical_best": theoretical_best,
            "elbow": elbow
        }

        # Return as JSON
        return result

    except Exception as e:
        return {"status": "error", "message": str(e)}, 500


def calculate_summary():
    """Asynchronous K-Means calculation and summary response."""
    print("Event summary triggered")
    try:
        # Check if CSV file exists
        CSV_FILE_PATH = "triangulation_results.csv"
        KMEANS_EXECUTABLE = "./kmeans"  # Replace with your executable path
        
        if not os.path.exists(CSV_FILE_PATH):
            print("File not found")
            return json.dumps({
                "status": "error",
                "message": "internal error: location file not found",
                "event": "summary_result"
            })

        # Run the K-Means executable
        subprocess.run([KMEANS_EXECUTABLE], check=True)
        res= summary_json()
        # Mock result generation (replace with your summary logic)
        csv_summary = summarize_csv_data(CSV_FILE_PATH)  # CSV summary with all points

        summary_data = {
            "status": "success",
            "data": {
                "kmeans_summary": res,
                "csv_summary": csv_summary
            },
            "event": "summary_result"
        }
        print("Summary calculation complete")
        return json.dumps(summary_data)

    except subprocess.CalledProcessError as e:
        print(f"Error running K-Means: {e}")
        return json.dumps({
            "status": "error",
            "message": f"Error running K-Means: {e.stderr}",
            "event": "summary_result"
        })

    except Exception as e:
        print(f"General Error: {e}")
        return json.dumps({
            "status": "error",
            "message": str(e),
            "event": "summary_result"
        })
    

@app.route('/data', methods=['POST'])
def forward_data():
    """HTTP endpoint to receive data and perform triangulation."""
    data = request.json
    print(f"Received from Lambda: {data}")
    try:
        device_id = data["device_id"]
        signal_level = int(data["signal_level"])
        timestamp = int(data["timestamp"])

        point = DEVICE_ID_TO_POINT.get(device_id)
        if point is None:
            raise ValueError(f"Unknown device_id: {device_id}")

        with shared_state_lock:  # Protect critical section
            # Critical section: modify shared_state
            if shared_state["CURRENT_TS"] == -1:
                shared_state["CURRENT_TS"] = timestamp

            if point == "A":
                shared_state["a_here"] = 1
                if shared_state["CURRENT_TS"] == timestamp:
                    shared_state["A_rssi"] = signal_level
                else:
                    shared_state["A_rssi"]=temporal_adjust(signal_level,shared_state["A_rssi"])
            elif point == "B":
                shared_state["b_here"] = 1
                if shared_state["CURRENT_TS"] == timestamp:
                    shared_state["B_rssi"] = signal_level
                else:
                    shared_state["B_rssi"]=temporal_adjust(signal_level,shared_state["B_rssi"])
            elif point == "C":
                shared_state["c_here"] = 1
                if shared_state["CURRENT_TS"] == timestamp:
                    shared_state["C_rssi"] = signal_level
                else:
                    shared_state["C_rssi"]=temporal_adjust(signal_level,shared_state["C_rssi"])
            if (
                shared_state["a_here"] != -1
                and shared_state["b_here"] != -1
                and shared_state["c_here"] != -1
            ):
                # Perform triangulation and reset state
                position = perform_triangulation(
                    shared_state["A_rssi"],
                    shared_state["B_rssi"],
                    shared_state["C_rssi"],
                )
                asyncio.run(
                    broadcast_to_websockets(
                        {"position": position, "timestamp": str(shared_state["CURRENT_TS"])}
                    )
                )
                success = append_to_csv(str(shared_state["CURRENT_TS"]), position["xPercentage"], position["yPercentage"])
                shared_state.update({
                    "CURRENT_TS": -1,
                    "a_here": -1,
                    "b_here": -1,
                    "c_here": -1,
                    "x_buffer":position["xPercentage"],
                    "y_buffer":position["yPercentage"]
                })
                response_tri_success={"status": "success", "position": position}
                print(response_tri_success)
                if not success:
                    response_error = {"status": "error", "message": "triangulation succeed but Failed to append triangulation result to CSV "}
                    print(response_error)
                    return response_error, 500
                print("saved to EC2 as CSV")
                return response_tri_success, 200
        response_pending={"status": "pending", "message": "Awaiting more data for triangulation"}
        print(response_pending)
        return response_pending, 200

    except Exception as e:
        response_error={"status": "error", "message": str(e)}
        print(response_error)
        return response_error, 500

def resetAllGlobalBuffer():
    shared_state.update( {
    "CURRENT_TS": -1,
    "A_rssi": -DEFAULT_POWER,
    "B_rssi": -DEFAULT_POWER,
    "C_rssi": -DEFAULT_POWER,
    "a_here": -1,
    "b_here": -1,
    "c_here": -1,
    "x_buffer":-DEFAULT_POWER,
    "y_buffer":-DEFAULT_POWER
})


@app.route('/shutdown', methods=['POST'])
def shutdown():
    """Shutdown the servers gracefully."""
    print("Shutdown requested via /shutdown endpoint...")
    resetAllGlobalBuffer()
    shutdown_server = request.environ.get('werkzeug.server.shutdown')
    if shutdown_server is None:
        raise RuntimeError("Not running with the Werkzeug Server")
    shutdown_server()  # Shut down Flask server
    print("Flask server shutting down...")
    loop.call_soon_threadsafe(loop.stop)  # Stop the WebSocket server loop
    print("WebSocket server shutting down...")
    return {"status": "success", "message": "Servers shutting down."}


# Shutdown handler
def shutdown_signal_handler():
    resetAllGlobalBuffer()
    print("Shutting down gracefully...")
    loop = asyncio.get_event_loop()

    # Stop the event loop directly
    loop.stop()
    shutdown()
    # Exit the process
    sys.exit(0)

async def main():
    """Run Flask and WebSocket servers in the same event loop."""
    # Register shutdown signal handlers
    loop = asyncio.get_event_loop()
    loop.add_signal_handler(signal.SIGINT, shutdown_signal_handler)
    loop.add_signal_handler(signal.SIGTERM, shutdown_signal_handler)

    # Start WebSocket server
    websocket_server = await websockets.serve(websocket_handler, "0.0.0.0", WS_PORT)

    # Start Flask server
    flask_task = loop.run_in_executor(None, lambda: app.run(host="0.0.0.0", port=8080))

    # Keep servers running indefinitely
    try:
        await asyncio.Future()  # Run forever unless interrupted
    except asyncio.CancelledError:
        print("Shutting down servers...")
        websocket_server.close()
        await websocket_server.wait_closed()

if __name__ == "__main__":
    try:
        initialize_csv()
        asyncio.run(main())
    except KeyboardInterrupt:
        print("Server stopped by KeyboardInterrupt")