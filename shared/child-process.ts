import child_process from "child_process";

export function execSync(
  command: string,
  options: child_process.ExecSyncOptions | null = null,
): Buffer | string {
  // Same as native but outputs std in case of error
  try {
    return child_process.execSync(command, options ?? undefined);
  } catch (error) {
    const { stdout, stderr } = error as { stdout?: Buffer; stderr?: Buffer };
    if (stdout) process.stdout.write(stdout);
    if (stderr) process.stderr.write(stderr);
    throw error;
  }
}

export function execCaptureOutput(
  command: string,
  args: readonly string[],
): string | undefined {
  const child = child_process.spawnSync(command, args, { encoding: "utf8" });

  if (child.error) {
    if (child.stdout) process.stdout.write(child.stdout);
    if (child.stderr) process.stderr.write(child.stderr);
    throw child.error;
  }

  return child.stdout;
}
