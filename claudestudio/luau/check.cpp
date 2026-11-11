// Claude Studio's script checker: Luau's own type checker (Luau.Analysis, MIT) compiled to
// WebAssembly as its own module (web/luaucheck.mjs, loaded only by the editor), checking one script
// against type definitions generated from the engine's class table (web/editor/luautypes.js).
// Nonstrict by default, as Roblox Studio checks scripts; `--!strict` in a script asks for strict.
#include "Luau/BuiltinDefinitions.h"
#include "Luau/ConfigResolver.h"
#include "Luau/Error.h"
#include "Luau/Frontend.h"

#include <emscripten.h>
#include <string>

namespace {
struct OneScript : Luau::FileResolver {
    std::string source;
    std::optional<Luau::SourceCode> readSource(const Luau::ModuleName& name) override {
        if (name != "script") return std::nullopt;
        return Luau::SourceCode{source, Luau::SourceCode::Script};
    }
};
OneScript files;
Luau::NullConfigResolver config;
Luau::Frontend* frontend = nullptr;
std::string out;
} // namespace

extern "C" {
// Set up the checker with the engine's definitions. Returns "" or what was wrong with them.
EMSCRIPTEN_KEEPALIVE const char* lc_init(const char* definitions) {
    config.defaultConfig.mode = Luau::Mode::Nonstrict;
    Luau::FrontendOptions options;
    options.runLintChecks = false;
    // The old solver: at this Luau revision the new one rejects the Instance.new overloads (one per
    // class) as too complex, and the old one is the long-standing nonstrict checker.
    delete frontend;
    frontend = new Luau::Frontend(Luau::SolverMode::Old, &files, &config, options);
    Luau::registerBuiltinGlobals(*frontend, frontend->globals);
    Luau::LoadDefinitionFileResult r = frontend->loadDefinitionFile(frontend->globals, frontend->globals.globalScope, definitions, "@studio", false);
    Luau::freeze(frontend->globals.globalTypes);
    out.clear();
    if (!r.success) {
        for (const Luau::ParseError& e : r.parseResult.errors)
            out += std::to_string(e.getLocation().begin.line + 1) + "\t" + e.getMessage() + "\n";
        if (r.module)
            for (const Luau::TypeError& e : r.module->errors)
                out += std::to_string(e.location.begin.line + 1) + "\t" + Luau::toString(e) + "\n";
        if (out.empty()) out = "0\tdefinitions failed to load\n";
    }
    return out.c_str();
}
// Check one script. Returns one line per problem: "line\tcolumn\tendLine\tendColumn\tmessage\n" (1-based).
EMSCRIPTEN_KEEPALIVE const char* lc_check(const char* source) {
    files.source = source;
    frontend->markDirty("script");
    Luau::CheckResult r = frontend->check("script");
    out.clear();
    for (const Luau::TypeError& e : r.errors) {
        std::string msg = Luau::toString(e);
        for (char& c : msg) if (c == '\n' || c == '\t') c = ' ';
        out += std::to_string(e.location.begin.line + 1) + "\t" + std::to_string(e.location.begin.column + 1) + "\t" +
               std::to_string(e.location.end.line + 1) + "\t" + std::to_string(e.location.end.column + 1) + "\t" + msg + "\n";
    }
    return out.c_str();
}
}
