import argparse
import pandas as pd
import matplotlib.pyplot as plt

def process(csv_file: str, chunk_hours: int, threshold: int, window_size: int):
    # load data
    df = pd.read_csv(csv_file, sep=';')
    df = df[['timestamp', 'proposer_validator']]
    df['timestamp'] = pd.to_numeric(df['timestamp'], errors='raise')

    # assign each row to a time‐bin
    min_time = df['timestamp'].min()
    df['bin'] = ((df['timestamp'] - min_time) / (chunk_hours * 3600)).astype(int)

    # lista de todos os validadores do CSV
    all_validators = df['proposer_validator'].unique().tolist()

    points = []
    for _, group in df.groupby('bin'):
        # conta e normaliza, incluindo validadores com zero blocks
        pct = (group['proposer_validator']
               .value_counts(normalize=True)
               .reindex(all_validators, fill_value=0))
        minimal_percentage = pct.min()

        ts_sorted = group['timestamp']
        if len(ts_sorted) > 1:
            diffs = ts_sorted.diff().dropna()
            average_interval = diffs.mean()
            max_interval = diffs.max()
            exceed_count = int((diffs > threshold).sum())
        else:
            average_interval = 0.0
            max_interval = 0.0
            exceed_count = 0

        # store (min%, avg, max, count>threshold)
        points.append((minimal_percentage,
                       average_interval,
                       max_interval,
                       exceed_count))

    # unpack into four sequences
    xs, ys_avg, ys_max, ys_exceed = zip(*points) if points else ([], [], [], [])

    # build windowed series: current chunk + next (window_size - 1) chunks
    window = window_size
    n = len(xs)
    if n >= window:
        limit = n - window + 1
        xs_w = xs[:limit]
        # average of avg_intervals over window
        ys_avg_w = [sum(ys_avg[i:i+window]) / window for i in range(limit)]
        # max of max_intervals over window
        ys_max_w = [max(ys_max[i:i+window]) for i in range(limit)]
        # sum of exceed_counts over window
        ys_exceed_w = [sum(ys_exceed[i:i+window]) for i in range(limit)]
    else:
        xs_w, ys_avg_w, ys_max_w, ys_exceed_w = ([], [], [], [])

    # 1) minimal % vs average interval (windowed)
    plt.figure(figsize=(8, 5))
    plt.scatter(xs_w, ys_avg_w)
    plt.xlabel('Minimal validator block %')
    plt.ylabel(f'Average inter‐block interval (s) ({window}-chunk window)')
    plt.title(f'Chunks of {chunk_hours}h (windowed)')
    plt.grid(True)
    plt.show()

    # 2) minimal % vs max interval (windowed)
    plt.figure(figsize=(8, 5))
    plt.scatter(xs_w, ys_max_w, color='orange')
    plt.xlabel('Minimal validator block %')
    plt.ylabel(f'Max inter‐block interval (s) ({window}-chunk window)')
    plt.title(f'Chunks of {chunk_hours}h (max over window)')
    plt.grid(True)
    plt.show()

    # 3) minimal % vs count of intervals > threshold (windowed)
    plt.figure(figsize=(8, 5))
    plt.scatter(xs_w, ys_exceed_w, color='green')
    plt.xlabel('Minimal validator block %')
    plt.ylabel(f'Count of intervals > {threshold}s ({window}-chunk window)')
    plt.title(f'Chunks of {chunk_hours}h (count over window)')
    plt.grid(True)
    plt.show()

def main():
    parser = argparse.ArgumentParser(
        description='Divide blockchain CSV into hourly chunks and plot metrics.'
    )
    parser.add_argument('csv_file', help='Path to input CSV')
    parser.add_argument('chunk', type=int, help='Chunk size in hours')
    parser.add_argument('threshold', type=int, help='Interval threshold in seconds')
    parser.add_argument('window_size', type=int, help='Window size (in number of chunks)')
    args = parser.parse_args()
    process(args.csv_file, args.chunk, args.threshold, args.window_size)

if __name__ == '__main__':
    main()