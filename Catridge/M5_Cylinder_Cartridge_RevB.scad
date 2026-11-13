// CoreS3 + DIN Base + Makita LXT USB adapter | Rev B prototype | mm
// OpenSCAD part options: assembly, gauge, front, rear, tray.
// 1. Measure minimum bore at entry and all support positions. Print gauge first.
// 2. Replace battery dimensions with assembled pack + USB adapter dimensions.
//    Width and height include clip/latch protrusions. Length excludes the plug
//    only if the plug and cable exit along the pipe axis into front_cable_gap.
// 3. In assembly, front ring is toward the removable cap. Replace all placeholder
//    dimensions before fabrication. Preview boxes are simplified envelopes.
// 4. Two M4 rods, washers and locknuts clamp the front insert and rear ring.
//    Use inner nuts/washers to locate the tray ears. Set back the forward rod
//    ends clear of the DIN Base and verify washer and nut access.
// 5. Two thin straps go through the tray slots and around the pack. Locate the
//    buckles in an axial pocket, outside the battery cross-section. Use thin
//    pads on the end stops to take up play. Confirm battery latch and USB access.
// 6. Use the current USB supply path. Secure the cable on the tray and pass it
//    through the front deck with edge protection and a service loop.
// 7. Capture cartridge axially between verified internal stop and cap-side
//    spacer. Shim contact lands with rigid fitted shims after the gauge test.
//    Keep the cover seal independent of the cartridge. Check cap clearance
//    and the usable length between stops before printing the full cartridge.

part = "assembly";
bore_min = 103;
diametral_gap = 1.0;
length_axial = 40;
land_width = 8;
ring_wall = 6;
rib_width = 6;
deck_thickness = 6;
standoff_height = 4;
boss_diameter = 9;
screw_clearance = 3.4;
lead_chamfer = 0.7;

// Provisional battery and adapter envelope, not measured from the photo.
battery_width = 74;
battery_height = 58;
battery_length = 115;
front_cable_gap = 30;
rear_service_gap = 10;
end_pad_gap = 1.5; // per end
strap_thickness = 1.2;
strap_width = 12;

$fn = 160;
r = (bore_min - diametral_gap) / 2;
body_length = length_axial - standoff_height;
hole_centers = [for (x = [-15, 15], y = [-31, 31]) [x, y]];
boss_radius_from_axis = norm([15, 31]) + boss_diameter / 2;

rod_x = 42;
rod_hole = 4.5;
ear_radius = 6;
rod_positions = [-rod_x, rod_x];
floor_width = 60;
floor_thickness = 4;
battery_bottom = -battery_height / 2;
tray_bottom = battery_bottom - floor_thickness;
stop_thickness = 6;
tray_length = battery_length + 2 * (end_pad_gap + stop_thickness);
tray_near_end = -front_cable_gap;
tray_far_end = tray_near_end - tray_length;
rear_start = tray_far_end - rear_service_gap - land_width;

assert(part == "assembly" || part == "gauge" || part == "front" ||
       part == "rear" || part == "tray",
       "Select assembly, gauge, front, rear or tray.");
assert(diametral_gap > 0 && r - lead_chamfer >= boss_radius_from_axis + 0.5,
       "Check bore, clearance and DIN mounting positions.");
assert(length_axial >= 30 && length_axial <= 50, "Use 30-50 mm overall.");
assert(part == "gauge" || norm([battery_width / 2 + strap_thickness,
             battery_height / 2 + strap_thickness]) < r - lead_chamfer,
       "Pack plus strap envelope exceeds available bore.");
assert(part == "gauge" || battery_width / 2 + strap_thickness < rod_x - 2,
       "Pack or strap may contact M4 rods.");
assert(norm([floor_width / 2, abs(tray_bottom) + strap_thickness]) < r - lead_chamfer,
       "Tray floor or straps exceed available bore.");
assert(rod_x + ear_radius <= r - lead_chamfer, "Rod ears exceed available bore.");
assert(battery_length >= 2 * (strap_width + 4), "Battery too short for two straps.");

echo(guide_od = 2 * r, cartridge_length_without_device_or_hardware = length_axial - rear_start,
     battery_diagonal = norm([battery_width, battery_height]));

module rod_bores(start, depth) {
    for (x = rod_positions)
        translate([x, 0, start])
            cylinder(d = rod_hole, h = depth);
}

module end_land() {
    cylinder(h = lead_chamfer, r1 = r - lead_chamfer, r2 = r);
    translate([0, 0, lead_chamfer])
        cylinder(h = land_width - 2 * lead_chamfer, r = r);
    translate([0, 0, land_width - lead_chamfer])
        cylinder(h = lead_chamfer, r1 = r, r2 = r - lead_chamfer);
}

module annular_land() {
    difference() {
        end_land();
        translate([0, 0, -1])
            cylinder(h = land_width + 2, r = r - ring_wall);
    }
}

module rails() {
    for (angle = [45, 135, 225, 315])
        rotate([0, 0, angle])
            translate([r - ring_wall - 1, -rib_width / 2, land_width - 1])
                cube([ring_wall - 0.3, rib_width, body_length - 2 * land_width + 2]);
}

module insert() {
    difference() {
        union() {
            rear_guide();
            translate([0, 0, body_length - land_width])
                annular_land();
            rails();
            // Clipped to the front chamfer. Overlaps the front support ring.
            intersection() {
                translate([0, 0, body_length - land_width])
                    end_land();
                translate([0, 0, body_length - deck_thickness])
                    cylinder(h = deck_thickness, r = r);
            }
            for (p = hole_centers)
                translate([p[0], p[1], body_length - 0.2])
                    cylinder(h = standoff_height + 0.2, d = boss_diameter);
        }
        for (p = hole_centers)
            translate([p[0], p[1], body_length - land_width - 1])
                cylinder(h = land_width + standoff_height + 2, d = screw_clearance);
        rod_bores(-1, body_length + 2);
        // Cable pass-through. Fit edge protection if cables cross this opening.
        translate([-12, -9, body_length - deck_thickness - 1])
            cube([24, 18, deck_thickness + 2]);
    }
}


module rear_guide() {
    difference() {
        union() {
            annular_land();
            for (x = rod_positions)
                translate([x, 0, 0])
                    cylinder(h = land_width, r = ear_radius);
        }
        rod_bores(-1, land_width + 2);
    }
}

module tray_end(z) {
    translate([0, 0, z])
        linear_extrude(height = stop_thickness)
            difference() {
                union() {
                    // Bridge from the low battery stop to each rod ear.
                    for (x = rod_positions)
                        hull() {
                            translate([x, 0]) circle(r = ear_radius);
                            translate([sign(x) * 23, tray_bottom + 5]) circle(r = 5);
                        }
                    translate([-28, tray_bottom]) square([56, 12]);
                }
                for (x = rod_positions)
                    translate([x, 0]) circle(d = rod_hole);
            }
}

module battery_tray() {
    difference() {
        union() {
            translate([-floor_width / 2, tray_bottom, 0])
                cube([floor_width, floor_thickness, tray_length]);
            tray_end(0);
            tray_end(tray_length - stop_thickness);
        }
        // Feed each strap through both slots. It bridges under the floor.
        for (x = [-24, 24], fraction = [0.25, 0.75])
            translate([x - 1.3, tray_bottom - 1,
                       stop_thickness + end_pad_gap + battery_length * fraction
                       - (strap_width + 2) / 2])
                cube([2.6, floor_thickness + 2, strap_width + 2]);
    }
}

module assembly() {
    color("steelblue") insert();
    color("steelblue") translate([0, 0, rear_start]) rear_guide();
    color("darkorange") translate([0, 0, tray_far_end]) battery_tray();
    for (x = rod_positions)
        color("silver")
            translate([x, 0, rear_start - 4])
                cylinder(d = 4, h = body_length - rear_start + 4);
    %translate([-battery_width / 2, battery_bottom,
                tray_far_end + stop_thickness + end_pad_gap])
        cube([battery_width, battery_height, battery_length]);
    // Rough DIN envelope only. The device, USB plug and cap need physical checks.
    %translate([-28, -36, length_axial]) cube([56, 72, 34]);
}

if (part == "gauge") annular_land();
if (part == "front") insert();
if (part == "rear") rear_guide();
if (part == "tray") translate([0, 0, -tray_bottom]) rotate([90, 0, 0]) battery_tray();
if (part == "assembly") assembly();

