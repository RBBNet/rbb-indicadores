import json
import subprocess
from pathlib import Path

def main():
    config_path = Path("simulation_config.json")
    output_dir = Path("data/batch")
    output_dir.mkdir(parents=True, exist_ok=True)

    # carrega config atual
    with config_path.open("r", encoding="utf-8") as f:
        config = json.load(f)

    for nv in (7, 8, 9, 10):
        for mi in (24, 2, 1):
            print(f"==> Running with num_validators={nv}, meeting_interval_in_hours={mi}")

            # atualiza somente esses campos
            config["num_validators"] = nv
            config["meeting_interval_in_hours"] = mi
            with config_path.open("w", encoding="utf-8") as f:
                json.dump(config, f, indent=4)

            # executa a simulação
            outfile = output_dir / f"intervals_v{nv}_m{mi}.csv"
            subprocess.run(
                ["python", "simulacao6.py", str(outfile)],
                check=True
            )

    print("All runs completed.")

if __name__ == "__main__":
    main()
