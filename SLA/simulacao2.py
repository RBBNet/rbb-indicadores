import os
import sys
import json
import random

# Enable debug mode if '--debug' is passed on the command line.
debug = '--debug' in sys.argv
if debug:
    print("[DEBUG] Debug mode enabled.")

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
            "mean_offline_time": float(os.getenv("MEAN_OFFLINE_TIME", 3600))
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

# --- QBFT Block production parameters ---
block_time = float(config.get("block_time", 5))  # base time interval between blocks (seconds)
request_timeout = float(
    config.get("request_timeout", 2))  # additional delay (seconds) if designated proposer is failing

# --- Quorum threshold for block production ---
quorum_fraction = 0.66  # at least 66% of the included validators must be online.

# --- Meeting parameters ---
meeting_time_offset = 11 * 3600  # meeting occurs at 11:00am (in seconds)
p_operator_absence = float(config.get("p_operator_absence", 0.1))  # chance an operator does not attend

# --- Failure and recovery parameters ---
T_fail = float(config.get("T_fail", 21600))  # mean time to failure (seconds)
lambda_fail = 1 / T_fail  # failure rate (per second)
mean_offline_time = float(config.get("mean_offline_time", 3600))  # mean offline time (seconds)


# ...rest of the code remains unchanged...
# ============================
# Define a simple Validator class.
# ============================
class Validator:
    def __init__(self, vid):
        self.id = vid
        self.state = "online"  # "online" means working; "failing" means it has failed.
        self.included = True  # Whether the validator is currently in the network’s validator list.
        self.offline_timer = 0  # When failing, counts down the remaining seconds offline.


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
last_network_status = None
current_uptime_start = None

# --- Variables for QBFT round robin block production --- 
next_block_time = 0
proposer_index = 0
consecutive_failure_count = 0

# ============================
# Main simulation loop (dt = 1 second)
# ============================
for t in range(simulation_duration):
    # --- Update validator states: failure and recovery.
    for validator in validators:
        if validator.state == "online":
            if random.random() < lambda_fail * dt:
                validator.state = "failing"
                validator.offline_timer = random.expovariate(1 / mean_offline_time)
                if debug:
                    print(
                        f"[DEBUG] t={t}: Validator {validator.id} transitioning to failing (offline_timer={validator.offline_timer:.2f})")
        elif validator.state == "failing":
            validator.offline_timer -= dt
            if validator.offline_timer <= 0:
                validator.state = "online"
                if debug:
                    print(f"[DEBUG] t={t}: Validator {validator.id} recovered and is now online")

    # --- Daily meeting at 11:00 am.
    if t % 86400 == meeting_time_offset:
        included_validators = [v for v in validators if v.included]
        if included_validators:
            count_attending = sum(1 for v in included_validators if random.random() < (1 - p_operator_absence))
            if debug:
                print(f"[DEBUG] t={t}: Meeting attendance - {count_attending} out of {len(included_validators)}")
            meeting_quorum = (count_attending > len(included_validators) / 2)
        else:
            meeting_quorum = False
            if debug:
                print(f"[DEBUG] t={t}: Meeting - no validators included")

        if meeting_quorum:
            if debug:
                print(f"[DEBUG] t={t}: Meeting quorum met")
            for validator in validators:
                if validator.state == "failing" and validator.included:
                    validator.included = False
                    if debug:
                        print(f"[DEBUG] t={t}: Validator {validator.id} excluded due to failure")
                elif validator.state == "online" and not validator.included:
                    validator.included = True
                    if debug:
                        print(f"[DEBUG] t={t}: Validator {validator.id} re-included as it recovered")
            # operator_attends = (random.random() < (1 - p_operator_absence))
            # if operator_attends:
            #     if validator.state == "failing" and validator.included:
            #         validator.included = False
            #         if debug:
            #             print(f"[DEBUG] t={t}: Validator {validator.id} excluded due to failure")
            #     elif validator.state == "online" and not validator.included:
            #         validator.included = True
            #         if debug:
            #             print(f"[DEBUG] t={t}: Validator {validator.id} re-included as it recovered")

            committee = [v for v in validators if v.included]
            active = sum(1 for v in committee if v.state == "online")
            # In the meeting quorum branch, initialize last_block_time:
            if committee and (active / len(committee) >= quorum_fraction):
                last_block_time = t  # record the time when block production restarts
                next_block_time = last_block_time + block_time
                proposer_index = 0
                consecutive_failure_count = 0
                if debug:
                    print(
                        f"[DEBUG] t={t}: Committee met quorum (active: {active}/{len(committee)}). Restarting block production.")
    # --- Determine network quorum based on the current consensus committee.
    committee = [v for v in validators if v.included]
    total_included = len(committee)
    active_validators = sum(1 for v in committee if v.state == "online")
    network_currently_up = total_included > 0 and (active_validators / total_included >= quorum_fraction)

    # --- Record uptime intervals.
    if last_network_status is None:
        last_network_status = network_currently_up
        if network_currently_up:
            current_uptime_start = t
    elif network_currently_up != last_network_status:
        if network_currently_up:
            current_uptime_start = t
        else:
            if current_uptime_start is not None:
                uptime_intervals.append((current_uptime_start, t))
                if debug:
                    print(
                        f"[DEBUG] t={t}: Network went down; recorded uptime interval from {current_uptime_start} to {t}")
                current_uptime_start = None
        last_network_status = network_currently_up

    if network_currently_up:
        network_up_time += dt

    # --- Block production event.
    if network_currently_up:
        if next_block_time is None:
            next_block_time = t + block_time

        if t >= next_block_time:
            committee = [v for v in validators if v.included]
            if committee:
                committee.sort(key=lambda v: v.id)
                designated_proposer = committee[proposer_index % len(committee)]
                if designated_proposer.state == "online":
                    block_timestamps.append(t)
                    last_block_time = t  # update the reference time for the next block
                    consecutive_failure_count = 0
                    next_block_time = last_block_time + block_time
                    if debug:
                        print(f"[DEBUG] t={t}: Block produced by Validator {designated_proposer.id}")
                    proposer_index = (proposer_index + 1) % len(committee)
                else:
                    consecutive_failure_count += 1
                    penalty = (2 ** (consecutive_failure_count - 1)) * request_timeout
                    next_block_time = last_block_time + block_time + penalty
                    if debug:
                        print(
                            f"[DEBUG] t={t}: Validator {designated_proposer.id} failed to propose block, penalty = {penalty}")
                    proposer_index = (proposer_index + 1) % len(committee)
            else:
                next_block_time = None
    else:
        next_block_time = None

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
