
"""
Fall Monitor - webcam person / fall detector.

Green check: Person detected, no fall
Red X: Person missing or possible fall detected

Keys:
    q / ESC = quit
    r = reset a fall alert
"""

import collections
import math
import time
from enum import Enum

import cv2
import mediapipe as mp



CAMERA_INDEX = 0
MIRROR_VIEW = True

MISSING_GRACE_S = 2.0
MIN_VISIBILITY = 0.5

HORIZONTAL_ANGLE_DEG = 55
UPRIGHT_ANGLE_DEG = 35
LYING_ASPECT_RATIO = 1.1

RAPID_DROP_SPEED = 1.0
RAPID_DROP_MEMORY_S = 2.0
DOWN_CONFIRM_S = 0.7
SLOW_FALL_CONFIRM_S = 6.0
RECOVERY_S = 1.5

mp_pose = mp.solutions.pose
mp_draw = mp.solutions.drawing_utils
PL = mp_pose.PoseLandmark


class Status(Enum):
    PERSON_OK = "Person detected"
    MISSING = "Person missing"
    FALL = "Possible fall detected"


def visible(lm):
    return lm.visibility >= MIN_VISIBILITY


def mean_point(landmarks, ids, w, h):
    points = [
        (landmarks[i].x * w, landmarks[i].y * h)
        for i in ids
        if visible(landmarks[i])
    ]

    if not points:
        return None

    x = sum(point[0] for point in points) / len(points)
    y = sum(point[1] for point in points) / len(points)

    return (x, y)


def analyze_pose(landmarks, w, h):
    """Calculate posture features, or return None if measurements fail."""

    shoulders = mean_point(
        landmarks,
        [PL.LEFT_SHOULDER, PL.RIGHT_SHOULDER],
        w,
        h
    )

    hips = mean_point(
        landmarks,
        [PL.LEFT_HIP, PL.RIGHT_HIP],
        w,
        h
    )

    if shoulders is None or hips is None:
        return None

    dx = shoulders[0] - hips[0]
    dy = shoulders[1] - hips[1]

    torso_len = math.hypot(dx, dy)

    if torso_len < 1e-3:
        return None


    angle = math.degrees(math.atan2(abs(dx), abs(dy)))

    xs = [
        landmark.x * w
        for landmark in landmarks
        if visible(landmark)
    ]

    ys = [
        landmark.y * h
        for landmark in landmarks
        if visible(landmark)
    ]

    if not xs or not ys:
        return None

    body_width = max(xs) - min(xs)
    body_height = max(ys) - min(ys)

    aspect = body_width / body_height if body_height > 1 else 0.0

    return {
        "angle": angle,
        "aspect": aspect,
        "hip_y": hips[1],
        "torso_len": torso_len,
    }


class FallDetector:

    def __init__(self):
        self.status = Status.MISSING
        self.last_seen = 0.0
        self.history = collections.deque()
        self.last_rapid_drop = -1e9
        self.down_since = None
        self.upright_since = None

    def update(self, features, now):

        # Handle a missing person.
        if features is None:
            self.history.clear()
            self.down_since = None
            self.upright_since = None

            if (
                self.status != Status.FALL
                and now - self.last_seen > MISSING_GRACE_S
            ):
                self.status = Status.MISSING

            return self.status

        self.last_seen = now

        if self.status == Status.MISSING:
            self.status = Status.PERSON_OK

        position = features["hip_y"] / features["torso_len"]
        self.history.append((now, position))

        while self.history and now - self.history[0][0] > 0.6:
            self.history.popleft()

        if len(self.history) >= 2:
            dt = self.history[-1][0] - self.history[0][0]

            if dt > 0.2:
                speed = (
                    self.history[-1][1] - self.history[0][1]
                ) / dt

                if speed > RAPID_DROP_SPEED:
                    self.last_rapid_drop = now

        is_down = (
            features["angle"] > HORIZONTAL_ANGLE_DEG
            or features["aspect"] > LYING_ASPECT_RATIO
        )

        is_upright = (
            features["angle"] < UPRIGHT_ANGLE_DEG
            and features["aspect"] <= LYING_ASPECT_RATIO
        )

        if is_down:
            self.upright_since = None

            if self.down_since is None:
                self.down_since = now

            down_for = now - self.down_since

            recent_drop = (
                now - self.last_rapid_drop < RAPID_DROP_MEMORY_S
            )

            rapid_fall_confirmed = (
                recent_drop and down_for >= DOWN_CONFIRM_S
            )

            slow_fall_confirmed = (
                SLOW_FALL_CONFIRM_S
                and down_for >= SLOW_FALL_CONFIRM_S
            )

            if rapid_fall_confirmed or slow_fall_confirmed:
                self.status = Status.FALL

        else:
            self.down_since = None

            if self.status == Status.FALL:
                if is_upright:
                    if self.upright_since is None:
                        self.upright_since = now

                    if now - self.upright_since >= RECOVERY_S:
                        self.status = Status.PERSON_OK
                else:
                    self.upright_since = None

        return self.status

    def reset(self):
        self.status = Status.PERSON_OK
        self.down_since = None
        self.upright_since = None
        self.last_rapid_drop = -1e9
        self.history.clear()


def draw_indicator(frame, status):
    """Draw the status badge in the top-right corner."""

    h, w = frame.shape[:2]

    ok = status == Status.PERSON_OK
    color = (60, 190, 60) if ok else (50, 50, 230)
    label = status.value

    (text_width, text_height), _ = cv2.getTextSize(
        label,
        cv2.FONT_HERSHEY_SIMPLEX,
        0.6,
        2
    )

    icon_size = 56
    padding = 12

    box_width = icon_size + padding * 3 + text_width
    box_height = icon_size + padding * 2

    x1 = w - box_width - 15
    y1 = 15
    x2 = w - 15
    y2 = 15 + box_height

    overlay = frame.copy()

    cv2.rectangle(
        overlay,
        (x1, y1),
        (x2, y2),
        (30, 30, 30),
        -1
    )

    cv2.addWeighted(overlay, 0.7, frame, 0.3, 0, frame)

    cv2.rectangle(
        frame,
        (x1, y1),
        (x2, y2),
        color,
        2
    )

    # Draw the circular icon.
    cx = x1 + padding + icon_size // 2
    cy = y1 + padding + icon_size // 2

    cv2.circle(frame, (cx, cy), icon_size // 2, color, -1)

    if ok:
        points = [
            (cx - 16, cy + 1),
            (cx - 4, cy + 13),
            (cx + 17, cy - 12)
        ]

        cv2.line(
            frame, points[0], points[1],
            (255, 255, 255), 6, cv2.LINE_AA
        )

        cv2.line(
            frame, points[1], points[2],
            (255, 255, 255), 6, cv2.LINE_AA
        )

    else:
        cv2.line(
            frame,
            (cx - 14, cy - 14),
            (cx + 14, cy + 14),
            (255, 255, 255),
            6,
            cv2.LINE_AA
        )

        cv2.line(
            frame,
            (cx - 14, cy + 14),
            (cx + 14, cy - 14),
            (255, 255, 255),
            6,
            cv2.LINE_AA
        )

    cv2.putText(
        frame,
        label,
        (x1 + padding * 2 + icon_size, cy + text_height // 2),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.6,
        (255, 255, 255),
        2,
        cv2.LINE_AA
    )

    # Flash a red border when a possible fall is detected.
    if status == Status.FALL:
        if int(time.time() * 2) % 2 == 0:
            cv2.rectangle(
                frame,
                (0, 0),
                (w - 1, h - 1),
                (50, 50, 230),
                8
            )


def main():

    cap = cv2.VideoCapture(CAMERA_INDEX)

    if not cap.isOpened():
        raise SystemExit(
            "Could not open the camera. Check System Settings > "
            "Privacy & Security > Camera and allow your terminal."
        )

    detector = FallDetector()
    window = "Fall Monitor"

    cv2.namedWindow(window, cv2.WINDOW_NORMAL)

    try:
        with mp_pose.Pose(
            model_complexity=1,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5
        ) as pose:

            while True:
                ok, frame = cap.read()

                if not ok:
                    print("Could not read a frame from the camera.")
                    break

                if MIRROR_VIEW:
                    frame = cv2.flip(frame, 1)

                h, w = frame.shape[:2]

                # Detect the person's pose.
                result = pose.process(
                    cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                )

                features = None

                if result.pose_landmarks:
                    features = analyze_pose(
                        result.pose_landmarks.landmark,
                        w,
                        h
                    )

                    # Draw body landmarks and connecting lines.
                    mp_draw.draw_landmarks(
                        frame,
                        result.pose_landmarks,
                        mp_pose.POSE_CONNECTIONS
                    )

                # Update the fall detector.
                status = detector.update(features, time.time())

                # Draw the green check or red X.
                draw_indicator(frame, status)

                # Display the torso angle when measurements are available.
                if features is not None:
                    cv2.putText(
                        frame,
                        f"Torso angle: {features['angle']:.0f} deg",
                        (10, h - 15),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.5,
                        (255, 255, 255),
                        1,
                        cv2.LINE_AA
                    )

                # Show the live camera window.
                cv2.imshow(window, frame)

                key = cv2.waitKey(1) & 0xFF

                if key in (ord("q"), 27):
                    break

                if key == ord("r"):
                    detector.reset()

    finally:
        cap.release()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
