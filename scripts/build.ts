#!/usr/bin/env bun

// Prevent bundling of NestJS's optional dependencies
const dependencies = [
  "@nestjs/microservices",
  "@nestjs/microservices/microservices-module",
  "@nestjs/platform-express",
  "@nestjs/platform-socket.io",
  "@nestjs/websockets/socket-module",
  "class-transformer",
  "class-transformer/storage",
  "class-validator",
];

const target = process.argv[2] as Bun.Build.CompileTarget | undefined;

const isMissing = (pkg: string): boolean => {
  try {
    Bun.resolveSync(pkg, process.cwd());
    return false;
  } catch {
    return true;
  }
};

const result = await Bun.build({
  entrypoints: ["./src/main.ts"],
  target: "bun",
  minify: true,
  external: dependencies.filter((pkg) => isMissing(pkg)),
  compile: {
    ...(target && { target }),
    outfile: "dist/server",
    execArgv: ["--smol"],
  },
});

if (!result.success) {
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}
