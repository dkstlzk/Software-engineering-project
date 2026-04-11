# RoomAvailabilityTimeline Component

A React component that visualizes room availability across a day using an interactive timeline.

## Installation

The component is located at:
```
/src/components/features/availability/RoomAvailabilityTimeline.tsx
```

## Usage

### Basic Example

```typescript
import { useRoomDayTimeline } from '@/hooks/useAvailability';
import { RoomAvailabilityTimeline } from '@/components/features/availability';

export function RoomDetailsPage({ roomId }: { roomId: number }) {
  const [date, setDate] = useState('2024-01-15');
  const { data: timeline, isLoading } = useRoomDayTimeline(roomId, date);

  if (isLoading) return <div>Loading...</div>;
  if (!timeline) return <div>No data</div>;

  return (
    <div className="p-6">
      <h1>{timeline.room.name}</h1>
      <p className="text-gray-600">{timeline.room.buildingName}</p>

      <div className="mt-6">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="px-3 py-2 border rounded"
        />
      </div>

      <div className="mt-6">
        <RoomAvailabilityTimeline
          segments={timeline.segments}
          dayStart="08:00"
          dayEnd="20:00"
          onFreeSlotClick={(startTime, endTime) => {
            console.log(`Book from ${startTime} to ${endTime}`);
          }}
          onSegmentClick={(segment) => {
            console.log('Show booking details:', segment.booking);
          }}
        />
      </div>
    </div>
  );
}
```

## Props

### `segments` (required)
- **Type:** `TimelineSegment[]`
- **Description:** Array of timeline segments representing bookings and free slots
- **Example:**
  ```typescript
  {
    start: "2024-01-15T08:00:00Z",
    end: "2024-01-15T09:30:00Z",
    status: "booked",
    booking: {
      id: 1,
      title: "Class A",
      bookedBy: "Prof. Smith",
      purpose: "Lecture"
    }
  }
  ```

### `dayStart` (optional)
- **Type:** `string` (HH:MM format)
- **Default:** `"00:00"`
- **Description:** Start time of the day to display on the timeline
- **Example:** `"08:00"`

### `dayEnd` (optional)
- **Type:** `string` (HH:MM format)
- **Default:** `"24:00"`
- **Description:** End time of the day to display on the timeline
- **Example:** `"20:00"`

### `onSegmentClick` (optional)
- **Type:** `(segment: TimelineSegment) => void`
- **Description:** Callback fired when a booked segment is clicked
- **Example:**
  ```typescript
  onSegmentClick={(segment) => {
    console.log('Show details for:', segment.booking);
  }}
  ```

### `onFreeSlotClick` (optional)
- **Type:** `(startTime: string, endTime: string) => void`
- **Description:** Callback fired when a free slot is clicked
- **Example:**
  ```typescript
  onFreeSlotClick={(startTime, endTime) => {
    console.log(`Book from ${startTime} to ${endTime}`);
    openBookingModal({ startTime, endTime });
  }}
  ```

## Features

### Visual Elements

1. **Time Labels**
   - Hour-by-hour labels showing the day's timeline
   - Automatically generated based on `dayStart` and `dayEnd`
   - Format: `HH:MM`

2. **Timeline Bar**
   - Horizontal bar showing all segments
   - Each segment is proportionally sized based on its duration
   - Color-coded status:
     - Green: Free/Available
     - Red: Booked
     - Dark Red: Restricted (booking details masked)

3. **Legend**
   - Color key explaining the three segment types
   - Located below the timeline

### Interactions

1. **Hover Tooltip**
   - Displays detailed information when hovering over a segment
   - Shows different content based on segment status:
     - **Free:** Time range and "Click to book" hint
     - **Restricted:** Time range and "Details not available"
     - **Booked:** Title, time, organizer, purpose, and contact info

2. **Click Handling**
   - Free slots trigger `onFreeSlotClick` callback
   - Booked segments trigger `onSegmentClick` callback

3. **Smooth Animations**
   - Opacity transitions on hover
   - Rounded corners and subtle shadows

## Styling

The component uses TailwindCSS utilities. All colors and spacing can be customized by modifying the Tailwind classes in the component.

### Key Classes
- `.bg-green-500` - Available slot background
- `.bg-red-500` - Booked slot background
- `.bg-red-900` - Restricted booking background
- `.text-gray-300` - Secondary text in tooltips

## Type Definitions

```typescript
interface RoomAvailabilityTimelineProps {
  segments: TimelineSegment[];
  dayStart?: string;      // "HH:MM" (default "00:00")
  dayEnd?: string;        // "HH:MM" (default "24:00")
  onSegmentClick?: (segment: TimelineSegment) => void;
  onFreeSlotClick?: (startTime: string, endTime: string) => void;
}

interface TimelineSegment {
  start: string;          // ISO 8601 datetime
  end: string;            // ISO 8601 datetime
  status: 'free' | 'booked';
  booking?: {
    id: number;
    title?: string;
    startAt: string;
    endAt: string;
    bookedBy?: string;
    activityName?: string;
    contactInfo?: string;
    purpose?: string;
  };
  isRestricted?: boolean; // true if booking details are masked
}
```

## Utility Functions

The component includes several internal utility functions:

### `getMinutesFromMidnight(isoString: string): number`
Converts an ISO 8601 datetime to minutes since midnight.

### `minutesToTimeString(minutes: number): string`
Converts minutes to HH:MM format.

### `getSegmentDimensions(segment, dayStartMin, dayDurationMin)`
Calculates the left position and width percentage for a segment based on the day range.

### `formatTime(isoString: string, format: 'HH:MM' | 'HH:MM:SS'): string`
Formats ISO datetime to human-readable time string.

## Examples

### Example 1: Simple Display (read-only)
```typescript
<RoomAvailabilityTimeline
  segments={timeline.segments}
  dayStart="08:00"
  dayEnd="18:00"
/>
```

### Example 2: With Booking Interaction
```typescript
<RoomAvailabilityTimeline
  segments={timeline.segments}
  dayStart="08:00"
  dayEnd="20:00"
  onFreeSlotClick={(startTime, endTime) => {
    setBookingForm({ startTime, endTime });
    setShowBookingModal(true);
  }}
/>
```

### Example 3: With Details Display
```typescript
const [selectedBooking, setSelectedBooking] = useState(null);

<>
  <RoomAvailabilityTimeline
    segments={timeline.segments}
    onSegmentClick={(segment) => {
      setSelectedBooking(segment.booking);
    }}
  />
  {selectedBooking && (
    <BookingDetailsPanel booking={selectedBooking} />
  )}
</>
```

## Future Enhancements

Potential features that could be added:

1. **Zoom Levels**
   - Week view
   - Month view

2. **Drag Interactions**
   - Drag to create/modify bookings

3. **Export**
   - Export as PNG
   - Export as PDF

4. **Advanced Filtering**
   - Filter by booking type
   - Filter by organizer

5. **Accessibility**
   - Enhanced ARIA labels
   - Full keyboard navigation
   - High contrast mode

## Testing Recommendations

1. **Empty Day** - No bookings
   - Expected: Single green "free" segment spanning the entire day

2. **Fully Booked Day**
   - Expected: Red segments with minimal gaps

3. **Mixed Visibility**
   - Test with admin (all details visible)
   - Test with restricted user (some details masked)

4. **Overlapping Bookings**
   - Expected: Consecutive red segments or merged display

5. **Time Range Filtering**
   - Test `dayStart="09:00"` and `dayEnd="17:00"`
   - Verify timeline shows only the specified range

## Browser Support

- Chrome/Edge (Latest)
- Firefox (Latest)
- Safari (Latest)
- Requires ES2020+ JavaScript support

## Accessibility

The component includes:
- Semantic HTML structure
- Hover tooltips for additional information
- Title attributes for basic screen reader support
- Color-coded status with text alternatives in tooltips

For enhanced accessibility, consider adding:
- ARIA labels for screen readers
- Full keyboard navigation support
- High contrast mode toggle
