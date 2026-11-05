// Ghidra headless script: name functions from il2cpp-names.mjs batches, then
// decompile some of them. For big libil2cpp.so files where full auto-analysis
// takes too long: import with -noanalysis, and this script creates just the
// functions it names (Ghidra disassembles each from its entry).
// Args: <names-dir> <name-or-address to decompile>...
// Example:
//   analyzeHeadless /tmp/proj p -import libil2cpp.so -noanalysis -deleteProject \
//     -scriptPath tools/rea-il2cpp -postScript ApplyNamesDecompile.java out/names 'gameManager$$Start'
import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;
import ghidra.program.model.symbol.SourceType;
import java.io.File;
import java.nio.file.Files;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class ApplyNamesDecompile extends GhidraScript {
    @Override
    public void run() throws Exception {
        String[] args = getScriptArgs();
        File dir = new File(args[0]);
        Pattern entry = Pattern.compile("\"(0x[0-9a-f]+)\":\"((?:[^\"\\\\]|\\\\.)*)\"");
        int named = 0;
        File[] files = dir.listFiles((d, n) -> n.startsWith("names-") && n.endsWith(".json"));
        java.util.Arrays.sort(files);
        for (File f : files) {
            Matcher m = entry.matcher(new String(Files.readAllBytes(f.toPath()), "UTF-8"));
            while (m.find()) {
                Address a = toAddr(m.group(1));
                String name = m.group(2).replace("\\\"", "\"").replace("\\\\", "\\");
                disassemble(a);
                Function fn = getFunctionAt(a);
                if (fn == null) fn = createFunction(a, name);
                if (fn != null) { fn.setName(name, SourceType.USER_DEFINED); named++; }
            }
        }
        println("named " + named + " functions");
        DecompInterface dec = new DecompInterface();
        dec.openProgram(currentProgram);
        for (int i = 1; i < args.length; i++) {
            Function fn = null;
            if (args[i].startsWith("0x")) fn = getFunctionAt(toAddr(args[i]));
            else for (Function f : currentProgram.getFunctionManager().getFunctions(true))
                if (f.getName().equals(args[i])) { fn = f; break; }
            if (fn == null) { println("no function: " + args[i]); continue; }
            DecompileResults r = dec.decompileFunction(fn, 120, monitor);
            println("=== " + fn.getName() + " @ " + fn.getEntryPoint() + "\n" +
                (r.decompileCompleted() ? r.getDecompiledFunction().getC() : r.getErrorMessage()));
        }
    }
}
