import { execSync } from 'child_process';


const isWindows = process.platform === 'win32';

try {
    const parentPID = process.ppid;
    let parentProcess;

    if (isWindows) {
        const command = `wmic process where ProcessId=${parentPID} get Name /value`;
        const output = execSync(command).toString().trim();
        parentProcess = output.split("=")[1]; // Extract the process name

        console.log("Invoking shell:", output);
    } else {
        parentProcess = execSync(`ps -o comm= -p ${parentPID}`).toString().trim();
    }
    
    console.log("Invoking shell:", parentProcess);
} catch (err) {
    console.error("Error detecting shell:", err);
}

