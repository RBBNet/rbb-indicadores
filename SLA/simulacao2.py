import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import os
import sys
import json
import random
import argparse
import pandas as pd

# Parse command line arguments
parser = argparse.ArgumentParser(description="Simulate validator failures and full simulation")
parser.add_argument("--stop", type=int, help="Pause simulation after x blocks produced")
parser.add_argument("--debug", action="store_true", help="Enable debug mode")
parser.add_argument("--distonly", action="store_true", help="Simulate only the distribution of failures and output CSV")
args = parser.parse_args()

debug = args.debug
stop_after = args.stop

# ============================
# Load configuration
# ============================
config = {}
# Try loading from simulation_config.json
if os.path.exists("simulation_config.json"):
    with open("simulation_config.json") as f:
        config = json.load(f)
else:
    print("No configuration file found. Using default parameters.")

# ============================
# Simulation parameters from config (with defaults)
# ============================
dt = 1  # simulation time-step (seconds)
simulation_duration = int(config.get("simulation_duration_days", 3)) * 86400
num_validators = int(config.get("num_validators", 10))
meeting_interval_in_hours = int(config.get("meeting_interval_in_hours", 5))
block_time = float(config.get("block_time", 5))
request_timeout = float(config.get("request_timeout", 2))

# --- Quorum threshold for block production ---
consensus_quorum_fraction = 2/3

# --- Meeting parameters ---
meeting_time_offset = 11 * 3600
p_operator_absence = float(config.get("p_operator_absence", 0.1))

# --- Failure and recovery parameters ---
# Expected time (in days) between short failures per validator.
T_fails_short = float(config.get("T_fails_short_days", 1)) * 24 * 60 * 60   # transforming to seconds
# Expected time (in days) between long failures per validator.
T_fails_long = float(config.get("T_fails_long_days", 10)) * 24 * 60 * 60 # transforming to seconds

lambda_fail_short = 1 / T_fails_short
lambda_fail_long = 1 / T_fails_long

# Expected time (in minutes) for short offline periods.
mean_short_offline_time = float(config.get("mean_short_offline_minutes", 5)) * 60   #transforming to seconds
# Expected time (in hours) for long offline periods.
mean_long_offline_time = float(config.get("mean_long_offline_hours", 12)) * 60 * 60 #transforming to seconds

# -----------------------------
# Print simulation configuration:
# -----------------------------
print("Simulation configuration parameters:")
print(f" dt = {dt} second(s)")
print(f" simulation_duration = {simulation_duration} second(s)")
print(f" num_validators = {num_validators}")
print(f" meeting_interval_in_hours = {meeting_interval_in_hours} hour(s)")
print(f" block_time = {block_time} second(s)")
print(f" request_timeout = {request_timeout} second(s)")
print(f" consensus_quorum_fraction = {consensus_quorum_fraction}")
print(f" meeting_time_offset = {meeting_time_offset} second(s)")
print(f" p_operator_absence = {p_operator_absence}")
print(f" T_fail_short = {T_fails_short} second(s)")
print(f" lambda_fail_short = {lambda_fail_short}")
print(f" T_fail_long = {T_fails_long} second(s)")
print(f" lambda_fail_long = {lambda_fail_long}")
print(f" mean_short_offline_time = {mean_short_offline_time} second(s)")
print(f" mean_long_offline_time = {mean_long_offline_time} second(s)")

# ============================
# Define a simple Validator class.
# ============================
class Validator:
    def __init__(self, vid, operator_reliability=1 - p_operator_absence):
        self.id = vid
        self.state = "online"  # "online" means working; "failing" means it has failed.
        self.included = True  # Whether the validator is currently in the network’s validator list.
        self.offline_timer = 0  # When failing, counts down the remaining seconds offline.
        self.operator_reliability = operator_reliability
        self.operator_present = False
        # New: list to track offline intervals, and a temporary variable for start time.
        self.offline_intervals = []
        self.offline_start = None

# ============================
# Initialize Validators
# ============================
validators = [Validator(vid) for vid in range(num_validators)]

# ============================
# Variables for SLAs and simulation bookkeeping.
# ============================
network_up_time = 0  # total seconds when the network is in a state that can produce blocks.
block_timestamps = []  # record simulation times (seconds) when a block is actually produced

uptime_intervals = []  # tuples (start_time, end_time) for continuous uptime periods
last_network_status = True
current_uptime_start = 0

# --- Variables for QBFT round robin block production ---
next_block_time = 0
proposer_index = 0
consecutive_failure_count = 0

network_down = False

meeting_interval_in_seconds = meeting_interval_in_hours * 3600

def format_time(t):
    days = t // 86400
    t %= 86400

    hours = t // 3600
    t %= 3600

    minutes = t // 60
    seconds = t % 60
    return f"day {days:02d} | {hours :02d}:{minutes:02d}:{seconds:02d}"

def debug_print(message, t=None):
    if debug:
        prefix = f"t={format_time(t)}: " if t is not None else ""
        print(f"[DEBUG] {prefix}{message}")

def pause(message, double = True):
    if not stop_after is None:
        print(message + " Press any key to continue...")
        input()
        if double:
            input()

# ============================
# Main simulation loop (dt = 1 second)
# ============================
def update_validators_states(validators, t):
    for validator in validators:
        if validator.state == "online":
            # Draw one random number per time-step
            r = random.random()
            # Check for short failure:
            if r < lambda_fail_short * dt:
                validator.state = "failing"
                validator.offline_start = t
                validator.offline_timer = random.expovariate(1 / mean_short_offline_time)
                debug_print(f"Validator {validator.id} transitioning to failing with SHORT offline period (timer={validator.offline_timer:.2f})", t)
                pause(f"Validator {validator.id} transitioning to failing", False)
            # Check for long failure (using "elif" so that both can't occur in the same time-step):
            elif r < (lambda_fail_short + lambda_fail_long) * dt:
                validator.state = "failing"
                validator.offline_start = t
                validator.offline_timer = random.expovariate(1 / mean_long_offline_time)
                debug_print(f"Validator {validator.id} transitioning to failing with LONG offline period (timer={validator.offline_timer:.2f})", t)
                pause(f"Validator {validator.id} transitioning to failing", False)
        elif validator.state == "failing":
            validator.offline_timer -= dt
            if validator.offline_timer <= 0:
                validator.state = "online"
                if validator.offline_start is not None:
                    validator.offline_intervals.append((validator.offline_start, t))
                    validator.offline_start = None
                pause(f"Validator {validator.id} recovered and is now online", False)
                
def restart_quorum_met(validators, t):
    """
    Checks if the operator quorum is met for restarting block production.
    Returns True if more than 2/3 of included validators
    (that are online) are present in the meeting.
    """
    count_included_online_present = sum(1 for v in validators if v.included and v.state == "online" and v.operator_present)
    count_included = sum(1 for v in validators if v.included)
    debug_print(f"Meeting attendance for restart - {count_included_online_present} out of {count_included}", t)
    return count_included_online_present > (2 / 3) * count_included

def include_exclude_quorum_met(validators, t):
    """
    Determines if the meeting quorum is met for inclusion/exclusion changes.
    Returns True if more than half of the included and online validators are present.
    """
    count_included_online_present = sum(1 for v in validators if v.included and v.state == "online" and v.operator_present)
    count_included = sum(1 for v in validators if v.included)
    debug_print(f"Meeting attendance for include/exclude - {count_included_online_present} out of {count_included}", t)
    return count_included_online_present > (count_included / 2)

def include_exclude_validators(validators_to_exclude, validators_to_include, t):
    """
    Excludes and re-includes validators based on the provided lists.
    """
    debug_print("=========================================================================", t)
    for validator in validators_to_exclude:
        validator.included = False
        debug_print(f"Validator {validator.id} excluded due to failure", t)
    for validator in validators_to_include:
        validator.included = True
        debug_print(f"Validator {validator.id} re-included as it recovered", t)
    debug_print("=========================================================================", t)

def calculate_operators_presence(validators, t):
    """
    Calculate the presence of operators for each validator.
    """
    for validator in validators:
        validator.operator_present = random.random() < validator.operator_reliability
        
    count_attending = sum(1 for v in validators if v.operator_present)
    debug_print(f"Total meeting attendance - {count_attending} out of {len(validators)}", t)

def consensus_quorum_met(validators):
    included_validators = [v for v in validators if v.included]
    total_included = len(included_validators)
    active_validators = sum(1 for v in included_validators if v.state == "online")
    network_currently_up = total_included > 0 and (active_validators / total_included > consensus_quorum_fraction)
    return network_currently_up

def network_is_up(validators):
    return consensus_quorum_met(validators)


# ----- Just generate the failures ----------------#
if args.distonly:
    progress_interval = max(1, simulation_duration // 100)  # progress every 1%
    for t in range(simulation_duration):
        if not debug and t % progress_interval == 0:
            print(f"Simulation progress: {t/simulation_duration*100:.1f}% complete")
        update_validators_states(validators, t)
    print("Distribution-only simulation complete.")
    
    # ----- End-of-simulation: CSV output -----
    simulation_start_timestamp = pd.Timestamp('2024-07-01 00:00:00')
    rows = []
    for validator in validators:
        for (start, end) in validator.offline_intervals:
            data_inicial = simulation_start_timestamp + pd.to_timedelta(start, unit='s')
            data_final = simulation_start_timestamp + pd.to_timedelta(end, unit='s')
            rows.append({
                'missingValidator': validator.id,
                'Instituição': '',
                'Data inicial': data_inicial.strftime('%d/%m/%Y %H:%M:%S'),
                'Data final': data_final.strftime('%d/%m/%Y %H:%M:%S')
            })
    
    if rows:
        output_df = pd.DataFrame(rows)
        output_filename = "dados_sim.csv"
        output_df.to_csv(output_filename, sep=';', index=False, encoding='latin-1')
        print(f"CSV file generated: '{output_filename}'")
    else:
        print("No offline intervals recorded for validators.")
    
    sys.exit(0)  # Exit so the full simulation does not run.

# ----- Main simulation loop (dt = 1 second) -----
progress_interval = max(1, simulation_duration // 100)  # update every 1%
for t in range(simulation_duration):
    if not debug and t % progress_interval == 0:
        print(f"Simulation progress: {t/simulation_duration*100:.1f}% complete")

    # --- Update validator states: failure and recovery.
    update_validators_states(validators, t)

    # --- Always record uptime as time progresses.
    # (Here we no longer use a separate network_down state to pause block production.)
    network_up_time += dt

    # --- Meeting time check: at meeting times we try to reset block production.
    if t % meeting_interval_in_seconds == 0 and t != 0:
        debug_print("=========================================================================", t)
        debug_print("Meeting time", t)
        debug_print("=========================================================================", t)
        # Print the status of each validator
        for validator in validators:
            debug_print(f"Validator {validator.id}: {'Included' if validator.included else 'Excluded'}, {validator.state}", t)
        pause(f"Simulation paused at meeting time.")

        # Calculate operators' presence for the meeting
        calculate_operators_presence(validators, t)

        # Instead of checking a "network_down" flag, we simply check if meeting quorum is met:
        if restart_quorum_met(validators, t):
            debug_print("=========================================================================", t)
            debug_print("Restarting block production", t)
            debug_print("=========================================================================", t)
            pause(f"Simulation paused after meeting.")
            # --- Restart block production: reset penalty.
            last_block_time = t            # record the time block production restarts
            next_block_time = t + block_time
            consecutive_failure_count = 0
        else:
            debug_print("=========================================================================", t)
            debug_print("Meeting quorum not met; no reset of block production", t)
            debug_print("=========================================================================", t)
            pause(f"Simulation paused after meeting.")
            # Continue production using the current next_block_time (with already accrued penalty).

    # --- Block production attempt: always attempt when t >= next_block_time.
    if t >= next_block_time:
        included_validators = [v for v in validators if v.included]
        if not included_validators:
            # Sanity check: if no validator is included, skip block production.
            continue

        included_validators.sort(key=lambda v: v.id)
        designated_proposer = included_validators[proposer_index % len(included_validators)]

        # Attempt block production:
        if consensus_quorum_met(validators) and designated_proposer.state == "online":
            # Block produced successfully.
            block_timestamps.append(t)
            last_block_time = t  # update reference time
            consecutive_failure_count = 0
            next_block_time = t + block_time
            debug_print(f"Block produced by Validator {designated_proposer.id}", t)
            if stop_after is not None and len(block_timestamps) % stop_after == 0:
                print(f"Simulation paused after producing {len(block_timestamps)} blocks. Press any key to continue...")
                input()
        else:
            # Block attempt fails: update consecutive failure count and apply penalty rule.
            consecutive_failure_count += 1
            penalty = (2 ** (consecutive_failure_count - 1)) * request_timeout
            next_block_time = last_block_time + block_time + penalty
            debug_print(
                f"Block attempt by Validator {designated_proposer.id} failed (state: {designated_proposer.state}), penalty = {penalty}",
                t
            )
        proposer_index = (proposer_index + 1) % len(included_validators)

# --- End-of-simulation:
if not network_down and current_uptime_start is not None:
    uptime_intervals.append((current_uptime_start, simulation_duration))

# ============================
# Calculate SLAs
# ============================
total_time = simulation_duration
network_producing_percentage = (network_up_time / total_time) * 100

if len(block_timestamps) > 1:
    block_intervals = [block_timestamps[i] - block_timestamps[i - 1] for i in range(1, len(block_timestamps))]
    average_block_time = sum(block_intervals) / len(block_intervals)
    max_block_time_overall = max(block_intervals)
else:
    average_block_time = None
    max_block_time_overall = None


def productive_time_in_interval(start, end, uptime_intervals):
    productive = 0
    for (u_start, u_end) in uptime_intervals:
        overlap_start = max(start, u_start)
        overlap_end = min(end, u_end)
        if overlap_end > overlap_start:
            productive += (overlap_end - overlap_start)
    return productive


productive_block_intervals = []
if len(block_timestamps) > 1:
    for i in range(1, len(block_timestamps)):
        prod_time = productive_time_in_interval(block_timestamps[i - 1], block_timestamps[i], uptime_intervals)
        productive_block_intervals.append(prod_time)
    max_productive_block_time = max(productive_block_intervals)
else:
    max_productive_block_time = None

print("Simulation SLAs:")
print(f"Total simulation time: {simulation_duration} seconds")
print(f"Percentage of time network producing blocks: {network_producing_percentage:.2f}%")
if average_block_time is not None:
    print(f"Average time to produce one block: {average_block_time:.2f} seconds")
else:
    print("Not enough block events to calculate average block time.")
if max_block_time_overall is not None:
    print(f"Maximum time to produce a block (overall): {max_block_time_overall:.2f} seconds")
else:
    print("Not enough block events to calculate maximum block time.")
if max_productive_block_time is not None:
    print(f"Maximum time to produce a block (excluding downtime): {max_productive_block_time:.2f} seconds")
else:
    print("Not enough block events to calculate maximum productive block time.")

# ----- End-of-simulation extra reporting replaced by CSV output -----
import pandas as pd

# Assume simulation started at a given timestamp.
simulation_start_timestamp = pd.Timestamp('2024-07-01 00:00:00')

# Create a list of rows for each validator's offline interval.
rows = []
for validator in validators:
    for (start, end) in validator.offline_intervals:
        data_inicial = simulation_start_timestamp + pd.to_timedelta(start, unit='s')
        data_final = simulation_start_timestamp + pd.to_timedelta(end, unit='s')
        rows.append({
            'missingValidator': validator.id,
            'Instituição': '',
            'Data inicial': data_inicial.strftime('%d/%m/%Y %H:%M:%S'),
            'Data final': data_final.strftime('%d/%m/%Y %H:%M:%S')
        })

if rows:
    output_df = pd.DataFrame(rows)
    # Save the CSV using semicolon separator and Latin-1 encoding.
    output_filename = "dados_sim.csv"
    output_df.to_csv(output_filename, sep=';', index=False, encoding='latin-1')
    print(f"CSV file generated: '{output_filename}'")
else:
    print("No offline intervals recorded for validators.")


# --- Calculate and export block interval statistics ---

if len(block_timestamps) > 1:
    # Compute the differences between consecutive block timestamps.
    block_intervals = [block_timestamps[i] - block_timestamps[i - 1] for i in range(1, len(block_timestamps))]
    
    # Count the occurrences of each interval.
    interval_counts = {}
    for interval in block_intervals:
        # Convert interval to an integer value (seconds) for grouping.
        interval_sec = int(interval)
        interval_counts[interval_sec] = interval_counts.get(interval_sec, 0) + 1

    # Transform the dict into a sorted list of tuples.
    sorted_intervals = sorted(interval_counts.items(), key=lambda x: x[0])

    # Create a DataFrame with two columns: "interval" and "count"
    df_intervals = pd.DataFrame(sorted_intervals, columns=["interval", "count"])

    # Save the CSV using semicolon separator and latin-1 encoding.
    df_intervals.to_csv("block_intervals.csv", sep=';', index=False, encoding='latin-1')
    print("Block intervals CSV file generated: 'block_intervals.csv'")
else:
    print("Not enough block events to calculate block intervals.")