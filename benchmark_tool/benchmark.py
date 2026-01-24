import subprocess
import time
import sys
import os
import re

try:
    import tiktoken
    enc = tiktoken.get_encoding("cl100k_base")
    def count_tokens(text):
        return len(enc.encode(text))
    print("[System] using tiktoken for counting.")
except ImportError:
    print("[System] tiktoken not found, using simple word count approximation (words * 1.3). Install with 'pip install tiktoken'.")
    def count_tokens(text):
        if not text: return 0
        return int(len(text.split()) * 1.3)

class BenchmarkResult:
    def __init__(self, name):
        self.name = name
        self.steps = []
        self.total_tokens = 0
        self.total_time = 0

    def add_step(self, tool, command, output, duration):
        tokens = count_tokens(output)
        self.steps.append({
            "tool": tool,
            "command": command,
            "tokens": tokens,
            "duration": duration,
            "output_len": len(output)
        })
        self.total_tokens += tokens
        self.total_time += duration
        print(f"[Step {len(self.steps)}] Tool: {tool}, Tokens: {tokens}, Time: {duration:.4f}s, OutputLen: {len(output)}")

class Runner:
    def __init__(self, cwd):
        self.cwd = cwd
        print(f"[System] Target Directory: {self.cwd}")

    def run_cmd(self, cmd_str, result_tracker):
        print(f"Running: {cmd_str}")
        start = time.time()
        try:
            # Capture both stdout and stderr
            res = subprocess.run(cmd_str, shell=True, cwd=self.cwd, capture_output=True, text=True)
            output = res.stdout
            if res.stderr:
                output += "\n[STDERR]\n" + res.stderr
        except Exception as e:
            output = str(e)
        
        duration = time.time() - start
        tool_name = cmd_str.split()[0]
        result_tracker.add_step(tool_name, cmd_str, output, duration)
        return output

def run_baseline(runner):
    print("\n==========================================")
    print("  Starting Group A (Baseline: grep/ls/cat)")
    print("==========================================")
    res = BenchmarkResult("Baseline (grep/cat)")
    
    # Task: Analyze SysUserServiceImpl.java selectUserList
    
    # 1. Locate the file
    print(">>> Goal: Find 'SysUserServiceImpl.java'")
    out1 = runner.run_cmd("find . -name SysUserServiceImpl.java", res)
    paths = [line for line in out1.split('\n') if line.strip().endswith('SysUserServiceImpl.java')]
    if not paths:
        print("!! File not found, using default assumption.")
        target_file = "ruoyi-system/src/main/java/com/ruoyi/system/service/impl/SysUserServiceImpl.java"
    else:
        target_file = paths[0].strip()
    
    # 2. Find definition of selectUserList
    print(f">>> Goal: Find definition of 'selectUserList' in {target_file}")
    out2 = runner.run_cmd(f"grep -n 'List<SysUser> selectUserList' {target_file}", res)
    
    line_num = 1
    match = re.search(r'^(\d+):', out2)
    if match:
        line_num = int(match.group(1))
    
    # 3. Read the method body (Simulating reading the file to understand context)
    print(f">>> Goal: Read file content {target_file}")
    # Agents often read the whole file or large chunks. Using cat to simulate standard behavior.
    runner.run_cmd(f"cat {target_file}", res)
    
    # 4. Find callers in the whole project
    print(">>> Goal: Find callers of 'selectUserList' in project")
    runner.run_cmd("grep -r 'selectUserList' . | head -n 20", res)
    
    # 5. Check one caller file context
    # Assume we found SysUserController.java in previous output or we know it.
    # Let's find a controller file in the grep output
    caller_file = "ruoyi-admin/src/main/java/com/ruoyi/web/controller/system/SysUserController.java"
    print(f">>> Goal: Read caller context in {caller_file}")
    runner.run_cmd(f"cat {caller_file}", res) # Reading full caller file
    
    return res

def run_git_ai(runner):
    print("\n==========================================")
    print("  Starting Group B (Experimental: git-ai)")
    print("==========================================")
    res = BenchmarkResult("Experimental (git-ai)")
    
    # 1. Search for symbol definition directly
    print(">>> Goal: Find definition of 'selectUserList' in 'SysUserServiceImpl'")
    # Using 'semantic' as 'find-def' proxy if precise symbol search isn't CLI exposed yet, 
    # but 'query' is symbol search.
    runner.run_cmd("git-ai ai query 'SysUserServiceImpl selectUserList'", res)
    
    # 2. Find usages/callers using Graph
    print(">>> Goal: Find callers of 'selectUserList'")
    runner.run_cmd("git-ai ai graph callers selectUserList", res)
    
    # 3. Analyze call chain
    print(">>> Goal: Analyze call chain")
    runner.run_cmd("git-ai ai graph chain selectUserList", res)
    
    # 4. Semantic search for logic summary
    # Limit to top 2 results to simulate efficient retrieval
    print(">>> Goal: Semantic search for logic summary")
    runner.run_cmd("git-ai ai semantic 'How does selectUserList work in SysUserServiceImpl?' --topk 2", res)
    
    return res

def print_report(baseline, experimental):
    print("\n\n")
    print("######################################################")
    print("#                  BENCHMARK REPORT                  #")
    print("######################################################")
    
    headers = ["Metric", "Baseline (grep/cat)", "Experimental (git-ai)", "Improvement"]
    
    # Metric 1: Total Tokens
    base_tok = baseline.total_tokens
    exp_tok = experimental.total_tokens
    diff_tok = (exp_tok - base_tok) / base_tok * 100 if base_tok > 0 else 0
    
    # Metric 2: Steps
    base_steps = len(baseline.steps)
    exp_steps = len(experimental.steps)
    diff_steps = (exp_steps - base_steps) / base_steps * 100 if base_steps > 0 else 0
    
    # Metric 3: Context Density (Tokens per Step)
    # User might mean 'Tokens per Step' or 'Relevant Info per Token'. 
    # Based on prompt 'Average Context Density', I'll use Tokens/Step.
    base_density = base_tok / base_steps if base_steps > 0 else 0
    exp_density = exp_tok / exp_steps if exp_steps > 0 else 0
    # For density, lower is better? Or higher? 
    # "Context Density" usually means "Information per Token". 
    # But here the user prompt example shows:
    # "Total Search Tokens" dropped (Good).
    # "Steps" dropped (Good).
    # "Context Density" ... wait, the prompt says "Average单次检索包含的字符数". 
    # If git-ai is precise, this might be lower.
    diff_density = (exp_density - base_density) / base_density * 100 if base_density > 0 else 0

    try:
        from tabulate import tabulate
        table = [
            ["Total Search Tokens", f"{base_tok:,}", f"{exp_tok:,}", f"{diff_tok:.1f}%"],
            ["Steps to Solution", str(base_steps), str(exp_steps), f"{diff_steps:.1f}%"],
            ["Avg Tokens/Step", f"{base_density:.1f}", f"{exp_density:.1f}", f"{diff_density:.1f}%"],
            ["Total Time (s)", f"{baseline.total_time:.2f}", f"{experimental.total_time:.2f}", f"{(experimental.total_time - baseline.total_time):.2f}s"]
        ]
        print(tabulate(table, headers=headers, tablefmt="github"))
    except ImportError:
        row_format = "{:<25} | {:<20} | {:<20} | {:<15}"
        print(row_format.format(*headers))
        print("-" * 90)
        print(row_format.format("Total Search Tokens", f"{base_tok:,}", f"{exp_tok:,}", f"{diff_tok:.1f}%"))
        print(row_format.format("Steps to Solution", str(base_steps), str(exp_steps), f"{diff_steps:.1f}%"))
        print(row_format.format("Avg Tokens/Step", f"{base_density:.1f}", f"{exp_density:.1f}", f"{diff_density:.1f}%"))
        print(row_format.format("Total Time (s)", f"{baseline.total_time:.2f}", f"{experimental.total_time:.2f}", f"{(experimental.total_time - baseline.total_time):.2f}s"))

if __name__ == "__main__":
    target_dir = "/Users/mars/dev/ruoyi"
    if len(sys.argv) > 1:
        target_dir = sys.argv[1]
    
    if not os.path.exists(target_dir):
        print(f"Error: Target directory {target_dir} does not exist.")
        sys.exit(1)
        
    runner = Runner(target_dir)
    
    # Ensure git-ai is ready (optional check)
    # subprocess.run("git-ai ai index", shell=True, cwd=target_dir) 
    
    base_res = run_baseline(runner)
    exp_res = run_git_ai(runner)
    
    print_report(base_res, exp_res)
