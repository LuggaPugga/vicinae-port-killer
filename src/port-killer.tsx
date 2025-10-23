import React, { useState, useEffect } from "react";
import { List, ActionPanel, Action, showToast, Icon } from "@vicinae/api";
import { exec } from "child_process";
import util from "util";

const execPromise = util.promisify(exec);

interface OpenPort {
	protocol: string;
	port: number;
	pid: number;
	process: string;
	user: string;
	address: string;
}

async function listOpenPorts(): Promise<OpenPort[]> {
	const { stdout } = await execPromise("lsof -i -P -n | grep LISTEN || true");
	const lines = stdout
		.split("\n")
		.map((l) => l.trim())
		.filter((l) => l && !l.startsWith("COMMAND"));

	const result: OpenPort[] = [];

	for (const line of lines) {
		const parts = line.split(/\s+/);
		if (parts.length < 9) continue;

		const process = parts[0];
		const pid = parseInt(parts[1], 10);
		const user = parts[2];
		const proto = parts[7];
		const addressField = parts[8];
		const portMatch =
			addressField.match(/:(\d+)\)$/) || addressField.match(/:(\d+)$/);
		const port = portMatch ? parseInt(portMatch[1], 10) : NaN;

		if (!isNaN(port)) {
			result.push({
				protocol: proto,
				port,
				pid,
				process,
				user,
				address: addressField,
			});
		}
	}

	return result;
}

async function killProcessByPort(port: number): Promise<void> {
	const ports = await listOpenPorts();
	const targets = ports.filter((p) => p.port === port);

	if (targets.length === 0) {
		throw new Error(`No process found on port ${port}`);
	}

  for (const target of targets) {
    await execPromise(`kill -9 ${target.pid}`).catch(() => null);
  }
}

export default function PortKiller() {
	const [ports, setPorts] = useState<OpenPort[]>([]);

	useEffect(() => {
		listOpenPorts()
			.then(setPorts)
			.catch(() => showToast({ title: "Failed to list ports" }));
	}, []);

	return (
		<List searchBarPlaceholder="Search ports...">
			<List.Section title={"Open Ports"}>
				{ports.map((port) => (
					<List.Item
						key={`${port.pid}-${port.port}`}
						title={`${port.process} (${port.port})`}
						subtitle={`PID: ${port.pid}, User: ${port.user}, Protocol: ${port.protocol}`}
						actions={
							<ActionPanel>
								<Action
									title="Kill Port"
									icon={Icon.Signal3}
									onAction={async () => {
										try {
											await killProcessByPort(port.port);
											setPorts((prev) =>
												prev.filter((p) => p.port !== port.port),
											);
											showToast({
												title: `Killed process on port ${port.port}`,
											});
											const newPorts = await listOpenPorts();
											setPorts(newPorts);
										} catch (e) {
											showToast({ title: "Failed to kill process" });
										}
									}}
								/>
							</ActionPanel>
						}
					/>
				))}
			</List.Section>
		</List>
	);
}
