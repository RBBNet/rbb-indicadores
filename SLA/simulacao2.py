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
    # Fallback: try loading from a .env file using python-dotenv
    try:
        from dotenv import load_dotenv

        load_dotenv()
        config = {
            "block_time": float(os.getenv("BLOCK_TIME", 5)),
            "request_timeout": float(os.getenv("REQUEST_TIMEOUT", 2)),
            "p_operator_absence": float(os.getenv("P_OPERATOR_ABSENCE", 0.1)),
            "T_fail": float(os.getenv("T_FAIL", 21600)),
            "simulation_duration": int(os.getenv("SIMULATION_DURATION", 3 * 86400)),
            "num_validators": int(os.getenv("NUM_VALIDATORS", 10)),
            "mean_offline_time": float(os.getenv("MEAN_OFFLINE_TIME", 3600)),
            "meeting_interval_in_hours": int(os.getenv("MEETING_INTERVAL_HOURS"), 5)
        }
    except ImportError:
        config = {}

# ============================
# Simulation parameters from config (with defaults)
# ============================
dt = 1  # simulation time-step (seconds)
simulation_duration = int(config.get("simulation_duration", 3 * 86400))
simulation_duration = simulation_duration * 86400 # isso vai permitir colocar em dias ao invés de segundos
num_validators = int(config.get("num_validators", 10))
meeting_interval_in_hours = int(config.get("meeting_interval_in_hours", 5))
# --- QBFT Block production parameters ---
block_time = float(config.get("block_time", 5))  # base time interval between blocks (seconds)
request_timeout = float(
    config.get("request_timeout", 2))  # additional delay (seconds) if designated proposer is failing

# --- Quorum threshold for block production ---
consensus_quorum_fraction = 2/3  # at least 2/3 of the included validators must be online.

# --- Meeting parameters ---
meeting_time_offset = 11 * 3600  # meeting occurs at 11:00am (in seconds)
p_operator_absence = float(config.get("p_operator_absence", 0.1))  # chance an operator does not attend

# --- Failure and recovery parameters ---
T_fail = float(config.get("T_fail", 21600))  # mean time to failure (seconds)
lambda_fail = 1 / T_fail  # failure rate (per second)
mean_offline_time = float(config.get("mean_offline_time", 3600))  # mean offline time (seconds)




# ============================
# Define a simple Validator class.
# ============================
class Validator:
    def __init__(self, vid,operator_reliability = 1 - p_operator_absence):
        self.id = vid
        self.state = "online"  # "online" means working; "failing" means it has failed.
        self.included = True  # Whether the validator is currently in the network’s validator list.
        self.offline_timer = 0  # When failing, counts down the remaining seconds offline.
        self.operator_reliability = operator_reliability
        self.operator_present = False

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

# ============================
# Main simulation loop (dt = 1 second)
# ============================
def update_validators_states(dt, lambda_fail, mean_offline_time, validators, t):
    for validator in validators:
        if validator.state == "online":
            if random.random() < lambda_fail * dt:
                validator.state = "failing"
                validator.offline_timer = random.expovariate(1 / mean_offline_time)
                debug_print(f"Validator {validator.id} transitioning to failing (offline_timer={validator.offline_timer:.2f})", t)
        elif validator.state == "failing":
            validator.offline_timer -= dt
            if validator.offline_timer <= 0:
                validator.state = "online"
                debug_print(f"Validator {validator.id} recovered and is now online", t)

def restart_quorum_met(validators, t):
    """
    Checks if the operator quorum is met for restarting block production.
    This function updates each validator's operator_present attribute,
    prints debug info, and returns True if more than 2/3 of included validators
    (that are online) are present in the meeting.
    """
    included_validators = [v for v in validators if v.included]
    # Update operator presence for all validators.
    for validator in validators:
        validator.operator_present = random.random() < validator.operator_reliability

    count_attending = sum(1 for v in validators if v.included and v.state == "online" and v.operator_present)
    debug_print(f"(Network down) Meeting attendance - {count_attending} out of {len(included_validators)}", t)
    return count_attending > (2 / 3) * len(included_validators)

def include_exclude_quorum_met(validators, t):
    """
    Determines if the meeting quorum is met for inclusion/exclusion changes.
    Updates each validator's operator presence, prints debug info,
    and returns True if more than half of the included and online validators are present.
    """
    included_validators = [v for v in validators if v.included]
    # Update operator presence for all validators.
    for validator in validators:
        validator.operator_present = random.random() < validator.operator_reliability

    count_attending = sum(1 for v in validators if v.included and v.state == "online" and v.operator_present)
    debug_print(f"Meeting attendance - {count_attending} out of {len(included_validators)}", t)
    return count_attending > (len(included_validators) / 2)

def include_exclude_validators(validators_to_exclude, validators_to_include, t):
    """
    Excludes and re-includes validators based on the provided lists.
    """
    for validator in validators_to_exclude:
        validator.included = False
        debug_print(f"Validator {validator.id} excluded due to failure", t)
    for validator in validators_to_include:
        validator.included = True
        debug_print(f"Validator {validator.id} re-included as it recovered", t)


# ------------------------------------------------------------
# --- Simulation loop ---
# ------------------------------------------------------------
for t in range(simulation_duration):
    # --- Update validator states: failure and recovery.
    update_validators_states(dt, lambda_fail, mean_offline_time, validators, t)

    # --- If the network is down, and it's not time for a meeting, skip the rest of the loop. ---
    # --- It means that the network only recovers during a meeting, independent of the states of the validators. 
    if network_down and t % meeting_interval_in_seconds != 0:
        debug_print("Network is down; skipping time step", t)
        continue

    # --- Meeting time check ---
    if t % meeting_interval_in_seconds == 0 and t != 0:
        debug_print("Meeting time", t)

        if network_down:
            debug_print("Network is down; checking for quorum to restart block production", t)
            # Use the restart_quorum function to decide if block production should restart.
            if restart_quorum_met(validators, t):
                debug_print("Restarting block production", t)
                # --- Restart block production ---
                last_block_time = t  # record the time production restarts
                next_block_time = last_block_time + block_time
                proposer_index = 0
                consecutive_failure_count = 0
                network_down = False
            else:
                # Restart quorum not met; network remains down.
                debug_print("Meeting quorum not met; network remains down", t)
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
            else:
                debug_print("Meeting not needed (no validators to fix)", t)

    # --- Determine network consensus quorum based on the current included validators. 
    included_validators = [v for v in validators if v.included]
    total_included = len(included_validators)
    active_validators = sum(1 for v in included_validators if v.state == "online")
    network_currently_up = total_included > 0 and (active_validators / total_included > consensus_quorum_fraction)

    if network_currently_up:
        # --- Record all the time the network is up ---
        network_up_time += dt

    # --- When state of the network changes...  
    if network_currently_up != last_network_status:
        last_network_status = network_currently_up
        if not network_currently_up:
            # It went down.
            network_down = True
            # Record the uptime interval until now.
            uptime_intervals.append((current_uptime_start, t))
            debug_print(f"Network went down; recorded uptime interval from {current_uptime_start} to {t}", t)
        else:
            # It went up, so we need to reset the current uptime start for a future uptime interval. 
            current_uptime_start = t

    # Inside the block production event:
    if t >= next_block_time:
        included_validators = [v for v in validators if v.included]
        included_validators.sort(key=lambda v: v.id)
        designated_proposer = included_validators[proposer_index % len(included_validators)]
        active_validators_count = sum(1 for v in included_validators if v.state == "online")
        consensus_quorum = (active_validators_count / len(included_validators)) >= consensus_quorum_fraction

        if consensus_quorum and designated_proposer.state == "online":
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
                f"Block attempt by Validator {designated_proposer.id} failed (consensus_quorum: {consensus_quorum}, state: {designated_proposer.state}), penalty = {penalty}",
                t
            )
        proposer_index = (proposer_index + 1) % len(included_validators)    

# --- End-of-simulation:
if last_network_status and current_uptime_start is not None:
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
