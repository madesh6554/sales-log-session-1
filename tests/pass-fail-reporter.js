// Prints a single unambiguous PASSED / FAILED banner as the last thing on screen.
// Does not touch the exit code — Playwright still fails the command on failure.

const LINE = '='.repeat(48);

class PassFailReporter {
  constructor() {
    this.passed = 0;
    this.failed = 0;
    this.failures = [];
  }

  onTestEnd(test, result) {
    if (result.status === 'passed') {
      this.passed += 1;
    } else if (result.status !== 'skipped') {
      this.failed += 1;
      this.failures.push(test.title);
    }
  }

  onEnd(result) {
    const total = this.passed + this.failed;

    console.log('');
    console.log(LINE);

    if (result.status === 'passed' && this.failed === 0) {
      console.log(`  PASSED  —  ${this.passed}/${total} tests`);
    } else {
      console.log(`  FAILED  —  ${this.failed}/${total} tests failed`);
      for (const title of this.failures) {
        console.log(`            - ${title}`);
      }
    }

    console.log(LINE);
    console.log('');
  }
}

module.exports = PassFailReporter;
