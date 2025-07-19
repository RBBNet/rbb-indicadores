#!/usr/bin/env python3
import argparse, csv, json, os, math, random
import logging
from datetime import datetime

def load_blocks(csv_path):
    """Load blocks CSV (assumes header row) into a list of dicts."""
    with open(csv_path, newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        return list(reader)

def load_simulation_params(json_path):
    """Load block_time and request_timeout from simulation_config.json."""
    with open(json_path, 'r', encoding='utf-8') as f:
        cfg = json.load(f)
    return cfg.get('block_time'), cfg.get('request_timeout')

def main():
    p = argparse.ArgumentParser(description="Load blocks CSV and simulation params")
    p.add_argument('blocks_csv', help="Path to blocks CSV file")
    p.add_argument(
        '--config',
        default=os.path.join(os.path.dirname(__file__), 'simulation_config.json'),
        help="Path to simulation_config.json"
    )
    p.add_argument(
        '--output',
        help="Path to failures CSV output"
    )
    p.add_argument('--verbose', action='store_true',
                   help="Enable verbose logging to console")
    args = p.parse_args()

    # set up logging
    level = logging.INFO if args.verbose else logging.WARNING
    logging.basicConfig(level=level, format='%(message)s')
    log = logging.info

    blocks = load_blocks(args.blocks_csv)
    block_time, request_timeout = load_simulation_params(args.config)
    threshold = block_time + request_timeout

    # derive default output name if not provided
    if args.output:
        out_csv = args.output
    else:
        base, ext = os.path.splitext(args.blocks_csv)
        out_csv = f"{base}-fails.csv"

    failing_state = {}        # validator -> start_ts
    last_produced = {}        # validator -> last block ts
    drawn_for_consensus = []  # temporary list of consensus-injected failures
    collected = []            # list of (validator, institution, start_ts, stop_ts)

    # before your existing for‐loop:
    prev_validators_set = None

    for i in range(1, len(blocks)):
        prev, curr = blocks[i-1], blocks[i]
        validators_prev = [prev[f'v{j}'] for j in range(1,11) if prev.get(f'v{j}')]
        validators_curr = [curr[f'v{j}'] for j in range(1,11) if curr.get(f'v{j}')]

        # detect a reconfiguration
        curr_set = set(validators_curr)
        if prev_validators_set is not None and curr_set != prev_validators_set:
            log(f"Reconfiguration at block {curr['number']}: validator set changed.")

            # 1) figure out who dropped out
            removed = prev_validators_set - curr_set
            # 2) yank their per‐validator state
            for v in removed:
                last_produced.pop(v, None)
                failing_state.pop(v, None)

        # 3) slide in the new set and continue processing this same block
        prev_validators_set = curr_set

        # verify both prev and curr miners are in the validator lists
        miner_prev = prev['miner']
        miner_curr = curr['miner']
        if miner_prev not in validators_prev:
            raise KeyError(f"Block {curr['number']}: previous miner {miner_prev!r} not in validators_prev")
        if miner_curr not in validators_curr:
            raise KeyError(f"Block {curr['number']}: current miner {miner_curr!r} not in validators_curr")

        prev_idx = validators_prev.index(miner_prev) + 1
        curr_idx = validators_curr.index(miner_curr) + 1

        nv = len(validators_prev)
        expected = prev_idx+1 if prev_idx < nv else 1
        interval = float(curr['timestamp']) - float(prev['timestamp'])

        new_failures = {}
        if curr_idx != expected or interval > threshold:
            log("="*18)
            log(f"Block: {curr['number']}, Interval: {interval}, Previous validator index: {prev_idx}, Current validator index: {curr_idx}")

            # determine skipped (failing) validators (using 1-based indexes)
            if expected < curr_idx:
                skipped_idxs = range(expected, curr_idx)
            else:
                skipped_idxs = list(range(expected, nv+1)) + list(range(1, curr_idx))

            # record new failures from the anomaly
            new_failures = {}
            if skipped_idxs:
                log("Validators detected failing:")
                for j in skipped_idxs:
                    validator = validators_prev[j-1]
                    current_failure_ts = float(curr['timestamp'])
                    if validator not in failing_state:
                        if validator in last_produced:
                            start_failure = last_produced[validator] + 1
                        else:
                            start_failure = current_failure_ts - block_time
                        new_failures[validator] = start_failure
                        log(f"{validator} - Started failing: {start_failure}")
                    else:
                        # already failing; report current block timestamp
                        log(f"{validator} - Still failing in: {current_failure_ts}")       
                # Print the other already failing nodes that were not part of this anomaly
                other_failures = [
                    v for v in failing_state
                    if v in validators_prev and (validators_prev.index(v) + 1) not in skipped_idxs
                ]
                if other_failures:
                    log("Other validators still failing:")
                    for v in other_failures:
                        start_ts = failing_state[v]
                        log(f"{v} - Still failing since: {start_ts}")
            
            # Determine consensus-stopping condition:
            # In Besu QBFT, if failing validators are ≥ ceil(N/3) consensus stops.
            required_failing = math.ceil(nv / 3)
            # If adding all new failures would meet or exceed the threshold, then
            # don't automatically mark all of them as failing.
            if new_failures and (len(failing_state) + len(new_failures) >= required_failing):
                additional_needed = required_failing - len(failing_state)
                log("It required additional validators to continue consensus:", additional_needed)
                log("CONSENSUS STOPPED - Not enough validators to continue. The ones that are failing are:")
                healthy = [v for v in validators_prev if v not in failing_state]
                if healthy and additional_needed > 0:
                    drawn_for_consensus = random.sample(healthy, additional_needed)
                    for v in drawn_for_consensus:
                        ts = float(curr['timestamp'])
                        start_ts = (last_produced[v]+1) if v in last_produced else ts - block_time # In this case, it's the first block production, so I chose something as a simplification
                        stop_ts = float(curr['timestamp'])
                        collected.append((v, "", start_ts, stop_ts))
                        log(f"{v} - Started failing (by draw): {start_ts}")
                        # Consensus recovery:
                        # As a block was produced, the consensus is not broken at the time of the timestamp of the block
                        # However, it is not possible to know which ones have returned. For simplicity, we consider that 
                        # the drawn ones returned to work properly. 
                        drawn_for_consensus.clear()    
            else:
                # If consensus would not break, add the new failures normally.
                for v, ts in new_failures.items():
                    if v not in failing_state:
                        failing_state[v] = ts

        # Check if the current block's miner was failing; if so, they recover now.
        curr_miner = curr['miner']
        if curr_miner in failing_state:
            start_ts = failing_state[curr_miner]
            stop_ts  = float(curr['timestamp'])
            collected.append((curr_miner, "", start_ts, stop_ts))
            log("="*18)
            log(f"Block: {curr['number']}")
            log("Validators stopped failing:")
            log(f"{curr_miner} - Failed: {start_ts} - Returned: {stop_ts}")
            del failing_state[curr_miner]

        # Update the last produced timestamp for the current block's miner
        last_produced[curr_miner] = float(curr['timestamp'])
    
    # In the end of the loop, if there are still validators in failing_state, collect them all
    for v, start_ts in failing_state.items():
        stop_ts = float(blocks[-1]['timestamp'])  # Use the last block's timestamp as end
        collected.append((v, "", start_ts, stop_ts))
        log("="*18)
        log(f"Block: {v}")
        log("Validators stopped failing:")
        log(f"{v} - Failed: {start_ts} - Returned: {stop_ts}")

    # Log the size of collected
    print(f"Collected {len(collected)} failure records.")

    # —— WRITE OUT CSV —— 
    # sort by start timestamp
    collected.sort(key=lambda x: x[2])
    with open(out_csv, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f, delimiter=';')
        writer.writerow(["missingValidator", "Instituição", "Data inicial", "Data final"])
        for v, inst, st, ed in collected:
            # format as dd/MM/YYYY HH:MM:SS
            di = datetime.fromtimestamp(st).strftime("%d/%m/%Y %H:%M:%S")
            df = datetime.fromtimestamp(ed).strftime("%d/%m/%Y %H:%M:%S")
            writer.writerow([v, inst, di, df])

    print(f"Wrote failures CSV to {out_csv!r}")

if __name__ == "__main__":
    main()