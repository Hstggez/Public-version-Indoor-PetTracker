#include <pthread.h>
#include <stdlib.h>
#include <stdio.h>
#include <math.h>
#include <time.h>
#include <float.h>

#define iterations_max 9999
#define convergence_threshold 0.001 // Define a small threshold for convergence
#define THRESHOLD_RATIO 0.1 // Threshold ratio to determine diminishing WCSS drops
#define input_file "./triangulation_results.csv"
#define output_file "./clusters.dat"

// Synchronization primitives
pthread_mutex_t mutex = PTHREAD_MUTEX_INITIALIZER;
pthread_cond_t cond = PTHREAD_COND_INITIALIZER;
int finished_threads = 0;

// Function to find the elbow point
int findElbowPoint(float *wcss_values, int k_min, int k_max) {
    float max_drop = 0.0;
    int elbow_k = k_min;

    for (int k = k_min + 1; k <= k_max; k++) {
        float drop = wcss_values[k - k_min - 1] - wcss_values[k - k_min]; // WCSS drop between k and k-1
        float relative_drop = drop / wcss_values[k - k_min - 1]; // Relative drop compared to previous WCSS

        printf("k = %d -> k = %d, WCSS drop = %.2f, Relative drop = %.2f%%\n",
               k - 1, k, drop, relative_drop * 100.0);

        if (relative_drop < THRESHOLD_RATIO) { // Significant drop threshold
            printf("Diminishing returns detected at k = %d\n", k - 1);
            break;
        }

        if (drop > max_drop) { // Track the largest WCSS drop
            max_drop = drop;
            elbow_k = k;
        }
    }

    printf("Elbow point detected at k = %d\n", elbow_k);
    return elbow_k;
}


// Define a structure for 2D points (latitude, longitude)
// Structure for 2D points
struct Point {
    float x;
    float y;
};

// Structure to hold point indices and their minimum distances
struct MinHeapNode {
    int index;      // Index of the data point
    float distance; // Minimum squared distance to any existing centroid
};

// Comparator function for the heap
int compare(const void *a, const void *b) {
    struct MinHeapNode *nodeA = (struct MinHeapNode *)a;
    struct MinHeapNode *nodeB = (struct MinHeapNode *)b;
    return (nodeA->distance > nodeB->distance) - (nodeA->distance < nodeB->distance);
}

// Euclidean squared distance (no sqrt for efficiency)
float squaredDistance(struct Point a, struct Point b) {
    float dx = a.x - b.x;
    float dy = a.y - b.y;
    return dx * dx + dy * dy;
}

void initKMeansPlusPlus(struct Point *kmeans, struct Point *data, int k_size, int data_size) {
    // Choose the first centroid randomly
    int first_index = rand() % data_size;
    kmeans[0] = data[first_index];

    // Min-heap to store distances of all points
    struct MinHeapNode *heap = malloc(data_size * sizeof(struct MinHeapNode));
    for (int i = 0; i < data_size; i++) {
        heap[i].index = i;
        heap[i].distance = squaredDistance(data[i], kmeans[0]);
    }
    qsort(heap, data_size, sizeof(struct MinHeapNode), compare); // Initial sort

    for (int i = 1; i < k_size; i++) {
        // Select the next centroid using weighted probability
        float total_distance = 0.0;
        for (int j = 0; j < data_size; j++) {
            total_distance += heap[j].distance;
        }

        float r = ((float)rand() / RAND_MAX) * total_distance;
        float cumulative = 0.0;
        int next_index = 0;

        for (int j = 0; j < data_size; j++) {
            cumulative += heap[j].distance;
            if (cumulative >= r) {
                next_index = heap[j].index;
                break;
            }
        }

        kmeans[i] = data[next_index]; // Add the new centroid

        // Update distances of all points to the new centroid
        for (int j = 0; j < data_size; j++) {
            float new_dist = squaredDistance(data[heap[j].index], kmeans[i]);
            if (new_dist < heap[j].distance) {
                heap[j].distance = new_dist;
            }
        }

        qsort(heap, data_size, sizeof(struct MinHeapNode), compare); // Re-sort heap
    }

    free(heap);
}

// Thread data structure
struct Threadstuff {
    int thread_id;
    struct Point *k_means;
    int k_size;
    struct Point *thread_data;
    int *locations; // Cluster assignments
    int load;
    int numofthreads;
};

// Calculate Euclidean distance between two points
float distance(struct Point p1, struct Point p2) {
    float dx = p1.x - p2.x;
    float dy = p1.y - p2.y;
    return sqrt(dx * dx + dy * dy);
}

// Initialize K-means centroids
void initKMeans(struct Point *kmeans, int k_size) {
    for (int i = 0; i < k_size; i++) {
        kmeans[i] = (struct Point){rand() % 100, rand() % 100}; // Random initialization
    }
}

int compareKs(struct Point p, struct Point *kmeans, int k_size) {
    float min_dist = FLT_MAX;
    int index = 0; // Default to cluster 0

    for (int i = 0; i < k_size; i++) {
        // Ensure kmeans is valid before comparison
        if (kmeans[i].x == -1.0f && kmeans[i].y == -1.0f) {
            continue; // Skip invalid centroids
        }

        float dist = distance(p, kmeans[i]);
        if (dist < min_dist) {
            min_dist = dist;
            index = i; // Update to the current closest cluster
        }
    }

    // Final validation: ensure the index is in the valid range
    if (index < 0 || index >= k_size) {
        fprintf(stderr, "Invalid cluster index %d for point (%.2f, %.2f). Assigning to default cluster 0.\n", 
                index, p.x, p.y);
        return 0; // Fail-safe: assign to cluster 0
    }

    return index;
}


int re_computeMeans(int *k_size, struct Point *kmeans, int *clusters, struct Point *data, int data_size) {
    struct Point totals[*k_size];
    int counts[*k_size];
    int empty_clusters = 0;
    int converged = 1;

    // Temporary array to store old centroids
    struct Point old_kmeans[*k_size];
    for (int i = 0; i < *k_size; i++) {
        old_kmeans[i] = kmeans[i];
        totals[i] = (struct Point){0.0, 0.0};
        counts[i] = 0;
    }

    // Accumulate points for each cluster
    for (int i = 0; i < data_size; i++) {
        int cluster_id = clusters[i];
        if (cluster_id < *k_size) {
            totals[cluster_id].x += data[i].x;
            totals[cluster_id].y += data[i].y;
            counts[cluster_id]++;
        }
    }

    // Update centroids and detect empty clusters
    for (int i = 0; i < *k_size; i++) {
        if (counts[i] > 0) {
            kmeans[i].x = totals[i].x / counts[i];
            kmeans[i].y = totals[i].y / counts[i];
        } else {
            printf("Warning: Cluster %d is empty and will be ignored.\n", i);
            kmeans[i].x = -1.0f; // Mark as invalid
            kmeans[i].y = -1.0f;
            empty_clusters++;
        }

        // Check for convergence
        if (counts[i] > 0 && distance(old_kmeans[i], kmeans[i]) > convergence_threshold) {
            converged = 0;
        }
    }

    // Reduce k if any clusters are invalid
    if (empty_clusters > 0) {
        printf("Reducing k from %d to %d due to empty clusters.\n", *k_size, *k_size - empty_clusters);
        *k_size=*k_size - empty_clusters;
        int valid_index = 0;

        // Compact valid centroids and reassign k
        for (int i = 0; i < *k_size; i++) {
            if (kmeans[i].x != -1.0f && kmeans[i].y != -1.0f) {
                kmeans[valid_index++] = kmeans[i];
            }
        }

        //*k_size = valid_index;

        // Reassign all points to valid clusters
        for (int i = 0; i < data_size; i++) {
            clusters[i] = compareKs(data[i], kmeans, *k_size);
        }

        return -1; // Signal k reduction
    }

    return converged; // Return 1 if centroids have converged
}


float calculateWCSS(int k_size, struct Point *kmeans, int *clusters, struct Point *data, int data_size) {
    float wcss = 0.0;

    // Iterate over each data point
    for (int i = 0; i < data_size; i++) {
        int cluster_id = clusters[i];

        // Skip invalid or unused clusters
        if (cluster_id < 0 || cluster_id >= k_size || (kmeans[cluster_id].x == -1.0f && kmeans[cluster_id].y == -1.0f)) {
            continue;
        }

        // Compute squared distance to the assigned cluster centroid
        float dx = data[i].x - kmeans[cluster_id].x;
        float dy = data[i].y - kmeans[cluster_id].y;
        wcss += dx * dx + dy * dy; // Faster than pow and sqrt
    }

    return wcss;
}

// Thread function to assign clusters
void *Threadfunc(void *data) {
    struct Threadstuff *mydata = (struct Threadstuff *)data;
    int start = mydata->thread_id * mydata->load;

    int end = (mydata->thread_id == mydata->numofthreads - 1) 
              ? mydata->load * mydata->numofthreads 
              : start + mydata->load;

    if (start >= end) return NULL;

    for (int i = start; i < end; i++) {
        mydata->locations[i] = compareKs(mydata->thread_data[i], mydata->k_means, mydata->k_size);
    }

    pthread_mutex_lock(&mutex);
    finished_threads++;
    if (finished_threads < mydata->numofthreads) {
        pthread_cond_wait(&cond, &mutex);
    } else {
        finished_threads = 0;
        pthread_cond_broadcast(&cond);
    }
    pthread_mutex_unlock(&mutex);
    return NULL;
}
// Read GPS data from a file
void readData(const char *filename, struct Point *data, int *data_size) {
    FILE *file = fopen(filename, "r");
    if (!file) {
        
        perror("Cannot open file");
        exit(EXIT_FAILURE);
    }

    char header[256]; // Buffer to store the header line
    fgets(header, sizeof(header), file); // Skip the first line
    int i = 0;
    while (fscanf(file, "%*f,%f,%f", &data[i].x, &data[i].y) == 2) {
        //printf("Read: x = %.2f, y = %.2f\n", data[i].x, data[i].y);//debug
        i++;
    }
    *data_size = i;
    //printf("Data size: %d\n", *data_size); //debug
    fclose(file);
}

// Write results to a file
void writeResults(const char *filename, struct Point *kmeans, int k_size) {
    FILE *file = fopen(filename, "w");
    if (!file) {
        
        perror("Cannot open file");
        exit(EXIT_FAILURE);
    }

    for (int i = 0; i < k_size; i++) {
        fprintf(file, "Centroid %d: %f, %f\n", i, kmeans[i].x, kmeans[i].y);
    }
    fclose(file);
}

void appendElbowStuff(const char *filename,int theo_max,int elbow, float *wcss_values){
    FILE *file = fopen(filename, "a");
    if (!file) {
        
        perror("Cannot open file");
        exit(EXIT_FAILURE);
    }
    for (int k = 2; k <= 10; k++){
        fprintf(file,"k = %d, WCSS = %f\n", k, wcss_values[k-2]);
    }
    
    fprintf(file,"theoretical_best = %d, elbow = %d\n", theo_max, elbow);
    fclose(file);
}

// Main function
int main(int argc, char **argv) {
    int data_size, number_threads = 4;

    if (argc > 1) {
        number_threads = atoi(argv[1]);
    }

    struct Point *data = malloc(sizeof(struct Point) * 10000); // Adjust based on data size
    readData(input_file, data, &data_size);

    int *clusters = calloc(data_size, sizeof(int));
    pthread_t threads[number_threads];
    struct Threadstuff thread_data_array[number_threads];

    int k_min = 2, k_max = 10;
    float best_wcss = FLT_MAX;
    int optimal_k = k_min;
    int reduced=0;
    //float temp=0;

    float wcss_values[k_max - 1]; // Array to store WCSS values
    int wcss_index = 0;


    printf("Evaluating WCSS for different k values...\n");
    for (int k = k_min; k <= k_max; k++) {
        struct Point *kmeans = malloc(sizeof(struct Point) * k);
        initKMeansPlusPlus(kmeans,data, k,data_size);
        /*if(reduced==-1){
            optimal_k--;
            break;    
        }*/
        int load = data_size / number_threads;
        int converged = 0;

        for (int iter = 0; iter < iterations_max && !converged; iter++) {
            for (int i = 0; i < number_threads; i++) {
                thread_data_array[i] = (struct Threadstuff){
                    .thread_id = i,
                    .k_means = kmeans,
                    .k_size = k,
                    .thread_data = data,
                    .locations = clusters,
                    .load = load,
                    .numofthreads = number_threads,
                };
                pthread_create(&threads[i], NULL, Threadfunc, (void *)&thread_data_array[i]);
            }

            for (int i = 0; i < number_threads; i++) {
                pthread_join(threads[i], NULL);
            }

            reduced=converged = re_computeMeans(&k, kmeans, clusters, data, data_size);

            if (k < k_min) {
                printf("Terminating: k reduced below k_min\n");
                break;
            }
        }

        float wcss = calculateWCSS(k, kmeans, clusters, data, data_size);
        printf("k = %d, WCSS = %f, reduced= %d \n", k, wcss,reduced);
        wcss_values[wcss_index++] = wcss;


   
        if(reduced!=-1){
            if((wcss < best_wcss )){
                best_wcss = wcss;
                optimal_k = k;
                //printf("bs_k = %d, bs_WCSS = %f\n", optimal_k, best_wcss);
            }

        }
        else{
            break;
        }
        


        free(kmeans);
        
    }
    free(clusters);

    printf("Therorical Optimal k = %d with WCSS = %f\n", optimal_k, best_wcss);

    int elbow_k = findElbowPoint(wcss_values, k_min, k_max);
    printf("Optimal k (Elbow Point) using elbow method = %d\n", elbow_k);
    int *clusters1 = calloc(data_size, sizeof(int));
    struct Point *final_kmeans = malloc(sizeof(struct Point) * elbow_k);
    initKMeansPlusPlus(final_kmeans,data, elbow_k,data_size);

    int load = data_size / number_threads;
    int converged1 = 0;

    for (int iter = 0; iter < iterations_max && !converged1; iter++) {
        for (int i = 0; i < number_threads; i++) {
            thread_data_array[i] = (struct Threadstuff){
                .thread_id = i,
                .k_means = final_kmeans,
                .k_size = elbow_k,
                .thread_data = data,
                .locations = clusters1,
                .load = load,
                .numofthreads = number_threads,
            };

            pthread_create(&threads[i], NULL, Threadfunc, (void *)&thread_data_array[i]);
        }

        for (int i = 0; i < number_threads; i++) {
            pthread_join(threads[i], NULL);
        }

        converged1 = re_computeMeans(&elbow_k, final_kmeans, clusters1, data, data_size);
    }
    
    writeResults(output_file, final_kmeans, elbow_k);
    appendElbowStuff(output_file,optimal_k,elbow_k,wcss_values);
    free(data);
    free(clusters1);
    free(final_kmeans);

    pthread_mutex_destroy(&mutex);
    pthread_cond_destroy(&cond);

    return 0;
}
