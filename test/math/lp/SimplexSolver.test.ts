import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { LinearProgram, LpObjectiveSense } from "../../../src/math/lp/LinearProgram";
import { LpSolution, LpStatus, lpStatusName } from "../../../src/math/lp/LpSolution";
import { SimplexOptions, SimplexSolver } from "../../../src/math/lp/SimplexSolver";
import { Rng } from "../../../src/core/Rng";
import { solveByVertexEnumeration } from "./ReferenceLpSolver";

const INF = Number.POSITIVE_INFINITY;

function solve(program: LinearProgram): LpSolution {
  return SimplexSolver.withDefaults().solve(program);
}

function assertFeasible(program: LinearProgram, solution: LpSolution): void {
  const violations = LpSolution.measureViolations(program, solution.values);
  assert.ok(violations[0] < 1e-6, "row violation " + violations[0].toString());
  assert.ok(violations[1] < 1e-6, "bound violation " + violations[1].toString());
}

describe("SimplexSolver: bounds only", () => {
  it("optimises a program with no rows", () => {
    const program = new LinearProgram(LpObjectiveSense.Maximize);
    program.addVariable(-2, 5, 1, "x");
    program.addVariable(-3, 4, -2, "y");
    const solution = solve(program);
    assert.equal(solution.status, LpStatus.Optimal);
    assert.equal(solution.value(0), 5);
    assert.equal(solution.value(1), -3);
    assert.equal(solution.objectiveValue, 5 + 6);
  });

  it("reports unbounded when an objective pushes against an infinite bound", () => {
    const program = new LinearProgram(LpObjectiveSense.Maximize);
    program.addVariable(0, INF, 1, "x");
    const solution = solve(program);
    assert.equal(solution.status, LpStatus.Unbounded);
    assert.equal(solution.objectiveValue, INF);
  });

  it("leaves a fixed variable alone", () => {
    const program = new LinearProgram(LpObjectiveSense.Maximize);
    program.addVariable(3, 3, 10, "fixed");
    const solution = solve(program);
    assert.equal(solution.status, LpStatus.Optimal);
    assert.equal(solution.value(0), 3);
  });
});

describe("SimplexSolver: textbook programs", () => {
  it("solves a two-variable production problem", () => {
    // max 3x + 5y  s.t.  x <= 4, 2y <= 12, 3x + 2y <= 18, x,y >= 0
    // Optimum is (2, 6) with objective 36.
    const program = new LinearProgram(LpObjectiveSense.Maximize);
    const x = program.addVariable(0, INF, 3, "x");
    const y = program.addVariable(0, INF, 5, "y");
    const r1 = program.addRow(-INF, 4, "r1");
    program.addEntry(r1, x, 1);
    const r2 = program.addRow(-INF, 12, "r2");
    program.addEntry(r2, y, 2);
    const r3 = program.addRow(-INF, 18, "r3");
    program.addEntry(r3, x, 3);
    program.addEntry(r3, y, 2);

    const solution = solve(program);
    assert.equal(solution.status, LpStatus.Optimal, lpStatusName(solution.status));
    assert.ok(Math.abs(solution.objectiveValue - 36) < 1e-9);
    assert.ok(Math.abs(solution.value(x) - 2) < 1e-9);
    assert.ok(Math.abs(solution.value(y) - 6) < 1e-9);
    assertFeasible(program, solution);
  });

  it("solves a minimisation with equality rows and free variables", () => {
    // min x + y  s.t.  x + 2y = 4, x - y = 1  =>  x = 2, y = 1, objective 3.
    const program = new LinearProgram(LpObjectiveSense.Minimize);
    const x = program.addVariable(-INF, INF, 1, "x");
    const y = program.addVariable(-INF, INF, 1, "y");
    const r1 = program.addEqualityRow(4, "r1");
    program.addEntry(r1, x, 1);
    program.addEntry(r1, y, 2);
    const r2 = program.addEqualityRow(1, "r2");
    program.addEntry(r2, x, 1);
    program.addEntry(r2, y, -1);

    const solution = solve(program);
    assert.equal(solution.status, LpStatus.Optimal);
    assert.ok(Math.abs(solution.value(x) - 2) < 1e-9, "x = " + solution.value(x).toString());
    assert.ok(Math.abs(solution.value(y) - 1) < 1e-9, "y = " + solution.value(y).toString());
    assert.ok(Math.abs(solution.objectiveValue - 3) < 1e-9);
  });

  it("honours ranged rows on both sides", () => {
    // max x  s.t.  2 <= x + y <= 6, y >= 1, x,y in [0, 10]
    const program = new LinearProgram(LpObjectiveSense.Maximize);
    const x = program.addVariable(0, 10, 1, "x");
    const y = program.addVariable(1, 10, 0, "y");
    const row = program.addRow(2, 6, "range");
    program.addEntry(row, x, 1);
    program.addEntry(row, y, 1);

    const solution = solve(program);
    assert.equal(solution.status, LpStatus.Optimal);
    assert.ok(Math.abs(solution.value(x) - 5) < 1e-9, "x = " + solution.value(x).toString());
    assertFeasible(program, solution);
  });

  it("handles negative lower bounds", () => {
    // min x  s.t.  x + y >= -3, y <= 1, x in [-10, 10], y in [-10, 10]
    const program = new LinearProgram(LpObjectiveSense.Minimize);
    const x = program.addVariable(-10, 10, 1, "x");
    const y = program.addVariable(-10, 1, 0, "y");
    const row = program.addRow(-3, INF, "r");
    program.addEntry(row, x, 1);
    program.addEntry(row, y, 1);

    const solution = solve(program);
    assert.equal(solution.status, LpStatus.Optimal);
    assert.ok(Math.abs(solution.value(x) - -4) < 1e-9, "x = " + solution.value(x).toString());
  });

  it("detects infeasibility", () => {
    const program = new LinearProgram(LpObjectiveSense.Maximize);
    const x = program.addVariable(0, 10, 1, "x");
    const r1 = program.addRow(5, INF, "at least 5");
    program.addEntry(r1, x, 1);
    const r2 = program.addRow(-INF, 2, "at most 2");
    program.addEntry(r2, x, 1);

    const solution = solve(program);
    assert.equal(solution.status, LpStatus.Infeasible, lpStatusName(solution.status));
    assert.ok(Number.isNaN(solution.objectiveValue));
  });

  it("detects infeasibility that only shows up through a combination of rows", () => {
    // x + y >= 10 but x <= 2 and y <= 3.
    const program = new LinearProgram(LpObjectiveSense.Minimize);
    const x = program.addVariable(0, 2, 1, "x");
    const y = program.addVariable(0, 3, 1, "y");
    const row = program.addRow(10, INF, "sum");
    program.addEntry(row, x, 1);
    program.addEntry(row, y, 1);
    assert.equal(solve(program).status, LpStatus.Infeasible);
  });

  it("detects an unbounded ray behind a constraint", () => {
    // max x + y s.t. x - y = 0, both unbounded above.
    const program = new LinearProgram(LpObjectiveSense.Maximize);
    const x = program.addVariable(0, INF, 1, "x");
    const y = program.addVariable(0, INF, 1, "y");
    const row = program.addEqualityRow(0, "link");
    program.addEntry(row, x, 1);
    program.addEntry(row, y, -1);
    assert.equal(solve(program).status, LpStatus.Unbounded);
  });

  it("terminates on Beale's cycling example", () => {
    // The classic degenerate program that cycles under a naive Dantzig rule.
    const program = new LinearProgram(LpObjectiveSense.Minimize);
    const x1 = program.addVariable(0, INF, -0.75, "x1");
    const x2 = program.addVariable(0, INF, 150, "x2");
    const x3 = program.addVariable(0, INF, -0.02, "x3");
    const x4 = program.addVariable(0, INF, 6, "x4");
    const r1 = program.addRow(-INF, 0, "r1");
    program.addEntry(r1, x1, 0.25);
    program.addEntry(r1, x2, -60);
    program.addEntry(r1, x3, -0.04);
    program.addEntry(r1, x4, 9);
    const r2 = program.addRow(-INF, 0, "r2");
    program.addEntry(r2, x1, 0.5);
    program.addEntry(r2, x2, -90);
    program.addEntry(r2, x3, -0.02);
    program.addEntry(r2, x4, 3);
    const r3 = program.addRow(-INF, 1, "r3");
    program.addEntry(r3, x3, 1);

    const solution = solve(program);
    assert.equal(solution.status, LpStatus.Optimal, lpStatusName(solution.status));
    assert.ok(
      Math.abs(solution.objectiveValue - -0.05) < 1e-9,
      "objective " + solution.objectiveValue.toString()
    );
    assertFeasible(program, solution);
  });

  it("respects the iteration budget instead of spinning", () => {
    const options = new SimplexOptions();
    options.maxIterations = 1;
    const solver = new SimplexSolver(options);
    const program = new LinearProgram(LpObjectiveSense.Maximize);
    const x = program.addVariable(0, 100, 3, "x");
    const y = program.addVariable(0, 100, 5, "y");
    const r1 = program.addRow(-INF, 40, "r1");
    program.addEntry(r1, x, 2);
    program.addEntry(r1, y, 3);
    const r2 = program.addRow(20, INF, "r2");
    program.addEntry(r2, x, 1);
    program.addEntry(r2, y, 1);
    const solution = solver.solve(program);
    assert.equal(solution.status, LpStatus.IterationLimit);
    assert.ok(solution.iterations <= 1);
  });
});

describe("SimplexSolver: agreement with brute-force vertex enumeration", () => {
  it("matches the reference solver on 200 random bounded programs", () => {
    const rng = new Rng(20260902);
    let compared = 0;
    let infeasibleCount = 0;
    for (let trial = 0; trial < 200; trial++) {
      const variableCount = 2 + rng.nextInt(2); // 2 or 3
      const rowCount = 1 + rng.nextInt(3);
      const maximize = rng.nextInt(2) === 1;
      const program = new LinearProgram(
        maximize ? LpObjectiveSense.Maximize : LpObjectiveSense.Minimize
      );
      for (let j = 0; j < variableCount; j++) {
        const lower = -5 + rng.nextInt(5);
        const upper = lower + 1 + rng.nextInt(8);
        program.addVariable(lower, upper, Math.round(rng.nextRange(-5, 5)), "x" + j.toString());
      }
      for (let i = 0; i < rowCount; i++) {
        const kind = rng.nextInt(3);
        const centre = Math.round(rng.nextRange(-8, 8));
        let lower = -INF;
        let upper = INF;
        if (kind === 0) {
          upper = centre;
        } else if (kind === 1) {
          lower = centre;
        } else {
          lower = centre;
          upper = centre + rng.nextInt(6);
        }
        const row = program.addRow(lower, upper, "r" + i.toString());
        for (let j = 0; j < variableCount; j++) {
          const coefficient = Math.round(rng.nextRange(-4, 4));
          if (coefficient !== 0) {
            program.addEntry(row, j, coefficient);
          }
        }
      }

      const solution = solve(program);
      const reference = solveByVertexEnumeration(program, 1e-9);

      if (!reference.feasible) {
        // The reference enumerates vertices, so it only proves infeasibility for the
        // bounded programs generated here -- which is exactly what these are.
        assert.equal(
          solution.status,
          LpStatus.Infeasible,
          "trial " + trial.toString() + ": expected infeasible, got " + lpStatusName(solution.status)
        );
        infeasibleCount++;
        continue;
      }
      assert.equal(
        solution.status,
        LpStatus.Optimal,
        "trial " + trial.toString() + ": " + lpStatusName(solution.status)
      );
      assertFeasible(program, solution);
      assert.ok(
        Math.abs(solution.objectiveValue - reference.objectiveValue) < 1e-6,
        "trial " +
          trial.toString() +
          ": simplex " +
          solution.objectiveValue.toString() +
          " vs reference " +
          reference.objectiveValue.toString()
      );
      compared++;
    }
    assert.ok(compared > 100, "expected a healthy number of feasible trials, got " + compared.toString());
    assert.ok(infeasibleCount > 0, "expected the generator to produce some infeasible programs");
  });
});

describe("SimplexSolver: robustness", () => {
  it("is bit-identical across repeated solves of the same program", () => {
    const build = (): LinearProgram => {
      const program = new LinearProgram(LpObjectiveSense.Maximize);
      const rng = new Rng(4242);
      const variables: number[] = [];
      for (let j = 0; j < 8; j++) {
        variables.push(program.addVariable(0, 10, rng.nextRange(-3, 3), "x" + j.toString()));
      }
      for (let i = 0; i < 6; i++) {
        const row = program.addRow(-INF, 15, "r" + i.toString());
        for (let j = 0; j < 8; j++) {
          program.addEntry(row, variables[j], rng.nextRange(-2, 4));
        }
      }
      return program;
    };
    const first = solve(build());
    const second = solve(build());
    assert.equal(first.status, second.status);
    assert.equal(first.iterations, second.iterations);
    for (let j = 0; j < first.values.length; j++) {
      assert.equal(first.values[j], second.values[j], "variable " + j.toString());
    }
  });

  it("solves a mid-sized random program and self-verifies", () => {
    const rng = new Rng(777);
    const program = new LinearProgram(LpObjectiveSense.Minimize);
    const variableCount = 90;
    const rowCount = 45;
    for (let j = 0; j < variableCount; j++) {
      program.addVariable(0, 20, rng.nextRange(-5, 5), "x" + j.toString());
    }
    for (let i = 0; i < rowCount; i++) {
      const row = program.addRow(rng.nextRange(-20, -5), rng.nextRange(5, 30), "r" + i.toString());
      for (let j = 0; j < variableCount; j++) {
        if (rng.nextFloat() < 0.2) {
          program.addEntry(row, j, rng.nextRange(-3, 3));
        }
      }
    }
    const solution = solve(program);
    assert.equal(solution.status, LpStatus.Optimal, lpStatusName(solution.status));
    assertFeasible(program, solution);

    // Optimality spot-check: no random feasible point beats the reported optimum.
    for (let sample = 0; sample < 200; sample++) {
      const candidate = new Float64Array(variableCount);
      for (let j = 0; j < variableCount; j++) {
        candidate[j] = rng.nextRange(0, 20);
      }
      const violations = LpSolution.measureViolations(program, candidate);
      if (violations[0] > 1e-9 || violations[1] > 1e-9) {
        continue;
      }
      assert.ok(program.evaluateObjective(candidate) >= solution.objectiveValue - 1e-6);
    }
  });

  it("rejects malformed programs loudly", () => {
    const program = new LinearProgram(LpObjectiveSense.Minimize);
    assert.throws(() => program.addVariable(5, 1, 0, "crossed"));
    assert.throws(() => program.addRow(5, 1, "crossed"));
    const x = program.addVariable(0, 1, 0, "x");
    const row = program.addRow(0, 1, "r");
    assert.throws(() => program.addEntry(row, x + 5, 1));
    assert.throws(() => program.addEntry(row + 5, x, 1));
  });

  it("drops explicit zero entries rather than storing them", () => {
    const program = new LinearProgram(LpObjectiveSense.Minimize);
    const x = program.addVariable(0, 1, 1, "x");
    const row = program.addRow(0, 1, "r");
    program.addEntry(row, x, 0);
    assert.equal(program.entryCount, 0);
  });
});
