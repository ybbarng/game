import Testing

@testable import CubieCore

/// 화면이 안 보일 때 멈추는 일들
struct AutoPauseTests {
  @Test func practiceTickRunsOnlyWhilePracticingWithFocus() {
    #expect(PracticeTick.runs(practicing: true, focused: true) == true)
    #expect(PracticeTick.runs(practicing: true, focused: false) == false)
    #expect(PracticeTick.runs(practicing: false, focused: true) == false)
  }

  @Test func playingReplayPausesWhenHiddenAndResumesWhenShown() {
    var a = AutoPause()
    #expect(a.update(visible: false, playing: true) == .pause)
    #expect(a.update(visible: true, playing: false) == .resume)
  }

  @Test func replayPausedByPersonStaysPausedWhenShownAgain() {
    var a = AutoPause()
    #expect(a.update(visible: false, playing: false) == .none)
    #expect(a.update(visible: true, playing: false) == .none)
  }

  @Test func personPressingWhileHiddenCancelsAutoResume() {
    var a = AutoPause()
    _ = a.update(visible: false, playing: true)
    a.forget()
    #expect(a.update(visible: true, playing: false) == .none)
  }

  @Test func repeatedHiddenNoticesPauseOnlyOnce() {
    var a = AutoPause()
    #expect(a.update(visible: false, playing: true) == .pause)
    #expect(a.update(visible: false, playing: false) == .none)
    #expect(a.update(visible: true, playing: false) == .resume)
  }
}
