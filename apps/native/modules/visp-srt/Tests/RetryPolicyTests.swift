import Testing
@testable import VispSrtPolicy

@Test func retriesForThirtySecondsThenExhausts() {
  var policy = RetryPolicy()

  #expect(policy.next()?.attempt == 1)
  #expect(policy.next()?.nanoseconds == 2_000_000_000)
  #expect(policy.next()?.nanoseconds == 4_000_000_000)
  #expect(policy.next()?.nanoseconds == 8_000_000_000)
  #expect(policy.next()?.nanoseconds == 15_000_000_000)
  #expect(policy.next() == nil)
}

@Test func cancellationStopsRetriesAndResetAllowsReconnect() {
  var policy = RetryPolicy()

  policy.cancel()
  #expect(policy.next() == nil)

  policy.reset()
  #expect(policy.next()?.attempt == 1)
  #expect(policy.isCancelled == false)
}
