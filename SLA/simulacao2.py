import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import os
import sys
import json
import random

# Enable debug mode if '--debug' is passed on the command line.
debug = '--debug' in sys.argv
if debug:
    print("[DEBUG] Debug mode enabled.")

# New: Optional simulation stop flag to pause after a certain number of blocks are produced.
stop_after = None
if "--stop" in sys.argv:
    stop_index = sys.argv.index("--stop")
    try:
        stop_after = int(sys.argv[stop_index + 1])
        if debug:
            print(f"[DEBUG] Simulation will pause after {stop_after} blocks are produced.")
    except (IndexError, ValueError):
        print("Usage: --stop <number>")
        sys.exit(1)

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
T_fail = float(config.get("T_fail_minutes", 32)) * 60
lambda_fail = 1 / T_fail
# Two offline time parameters:
mean_short_offline_time = float(config.get("mean_short_offline_time", 60))
mean_long_offline_time = float(config.get("mean_long_offline_time", 19800))
# probability of short offline time
p_short_offline = float(config.get("p_short_offline", 0.8)) 




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
            if random.random() < lambda_fail * dt:
                validator.state = "failing"
                # Record when the validator goes offline.
                validator.offline_start = t
                # Choose between the short or long offline time.
                if random.random() < p_short_offline:
                    validator.offline_timer = random.expovariate(1 / mean_short_offline_time)
                    debug_print(f"Validator {validator.id} transitioning to failing with SHORT offline period (timer={validator.offline_timer:.2f})", t)
                else:
                    validator.offline_timer = random.expovariate(1 / mean_long_offline_time)
                    debug_print(f"Validator {validator.id} transitioning to failing with LONG offline period (timer={validator.offline_timer:.2f})", t)
                pause(f"Validator {validator.id} transitioning to failing", False)
        elif validator.state == "failing":
            validator.offline_timer -= dt
            if validator.offline_timer <= 0:
                validator.state = "online"
                # Record the offline interval.
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

# ----- Main simulation loop (dt = 1 second) -----
progress_interval = max(1, simulation_duration // 100)  # update every 1%
for t in range(simulation_duration):
    if not debug and t % progress_interval == 0:
        print(f"Simulation progress: {t/simulation_duration*100:.1f}% complete")
    
    # --- Update validator states: failure and recovery.
    update_validators_states(validators, t)

    # --- Check whether the network is up or down
    network_currently_down = not network_is_up(validators)

    # --- Record all the time the network is up ---
    if not network_currently_down:        
        network_up_time += dt

    # --- When the network goes down
    if network_currently_down and not network_down:
        # This is the time network went down.
        # This variable goes down anytime, but only goes up during the meeting. 
        network_down = True
        # Record the uptime interval until now.
        uptime_intervals.append((current_uptime_start, t))
        debug_print("=========================================================================", t)
        debug_print(f"Network went down; recorded uptime interval from {current_uptime_start} to {t}", t)
        debug_print("=========================================================================", t)
        if not stop_after is None:
            print(f"Simulation paused after network went down. Press any key to continue...")
            input()
        # Although it could continue the loop because it may be the time for meeting, 
        # I prefer to skip the loop for simplicity.
        continue

    # --- If the network is down, and it's not time for a meeting, skip the rest of the loop. ---
    if network_down and t % meeting_interval_in_seconds != 0:
        continue

    # --- Meeting time check ---
    if t % meeting_interval_in_seconds == 0 and t != 0:
        log_network_down = True
        debug_print("=========================================================================", t)
        debug_print("Meeting time", t)
        debug_print("=========================================================================", t)
        # Print the status of each validator (if it is included and if it is online). 
        for validator in validators:
            debug_print(f"Validator {validator.id}: {'Included' if validator.included else 'Excluded'}, {validator.state}", t)
        pause(f"Simulation paused at meeting time.")

        # Calculate whether operators are attending this meeting
        calculate_operators_presence(validators, t)

        if network_down:
            debug_print("Checking for quorum to restart block production", t)
            # Use the restart_quorum function to decide whether block production should restart.
            if restart_quorum_met(validators, t):
                debug_print("=========================================================================", t)
                debug_print("Restarting block production", t)
                debug_print("=========================================================================", t)
                pause(f"Simulation paused after meeting.")
                # --- Restart block production ---
                last_block_time = t  # record the time production restarts
                next_block_time = last_block_time + block_time
                proposer_index = 0
                consecutive_failure_count = 0
                network_down = False
                current_uptime_start = t
            else:
                # Restart quorum not met; network remains down.
                debug_print("=========================================================================", t)
                debug_print("Meeting quorum not met; network remains down", t)
                debug_print("=========================================================================", t)
                pause(f"Simulation paused after meeting.")
                # --- Resume the loop 
                continue
        else:
            # Check if any validators need to be included or excluded.
            debug_print("Network is up; checking for validators to include/exclude", t)
            validators_to_exclude = [v for v in validators if v.included and v.state == "failing"]
            validators_to_include = [v for v in validators if not v.included and v.state == "online"]

            if validators_to_exclude or validators_to_include:
                if include_exclude_quorum_met(validators, t):
                    debug_print("Meeting quorum met", t)
                    include_exclude_validators(validators_to_exclude, validators_to_include, t)
                    pause(f"Simulation paused after meeting.")
            else:
                debug_print("Meeting not needed (no validators to fix)", t)
                pause(f"Simulation paused after meeting.")

  
    # Inside the block production event:
    if t >= next_block_time:
        included_validators = [v for v in validators if v.included]
        included_validators.sort(key=lambda v: v.id)
        designated_proposer = included_validators[proposer_index % len(included_validators)]

        if consensus_quorum_met(validators) and designated_proposer.state == "online":
            # Block is produced successfully.
            block_timestamps.append(t)
            last_block_time = t  # update the reference time for the next block
            consecutive_failure_count = 0
            next_block_time = last_block_time + block_time
            debug_print(f"Block produced by Validator {designated_proposer.id}", t)
            # Check if a pause should occur every stop_after blocks.
            if stop_after is not None and len(block_timestamps) % stop_after == 0:
                print(f"Simulation paused after producing {len(block_timestamps)} blocks. Press any key to continue...")
                input()
        else:
            # Block attempt fails.
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

# ----- End-of-simulation extra reporting (only if not in debug mode) -----
if not debug:
    print("\nAdditional Simulation Details:")

    # 1. Print every time interval a node was offline.
    print("\nOffline intervals per node:")
    for validator in validators:
        if validator.offline_intervals:
            print(f"Validator {validator.id}:")
            for (start, end) in validator.offline_intervals:
                duration = end - start
                print(f"  Offline from t={start} to t={end} (Duration {duration} seconds)")
        else:
            print(f"Validator {validator.id}: Always online.")

    # 2. Compute and print every time interval the network was NOT producing blocks.
    downtime_intervals = []
    previous_end = 0
    for (u_start, u_end) in sorted(uptime_intervals):
        if u_start > previous_end:
            downtime_intervals.append((previous_end, u_start))
        previous_end = u_end
    if previous_end < simulation_duration:
        downtime_intervals.append((previous_end, simulation_duration))
    
    print("\nNetwork downtime intervals (NOT producing blocks):")
    if downtime_intervals:
        for (start, end) in downtime_intervals:
            duration = end - start
            print(f"  Downtime from t={start} to t={end} (Duration {duration} seconds)")
    else:
        print("  None. The network produced blocks continuously.")

    # ----- Generate a histogram for validator offline durations (10-min bins) -----
    offline_durations = []
    for validator in validators:
        for (start, end) in validator.offline_intervals:
            offline_durations.append(end - start)

    if offline_durations:     
        plt.figure(figsize=(10,6))
        plt.hist(offline_durations, bins=50, edgecolor='black')
        plt.xlabel("Duração Offline (segundos)")
        plt.ylabel("Número de ocorrências")
        plt.title("Distribuição dos períodos offline dos validadores")
        plt.grid(True)
        plt.tight_layout()
        
        plt.savefig("offline_histogram.png")
        plt.close()
        print("Offline histogram saved to 'offline_histogram.png'")
    else:
        print("\nNo offline intervals recorded for validators.")