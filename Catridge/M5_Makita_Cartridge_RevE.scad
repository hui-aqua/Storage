// Rev E | CoreS3 and Makita 5 Ah + ADP05 | mm
// Look from the cap into the tube: battery on right (+X), ADP05 on left (-X).
// Print two copies of "saddle". Face the small locating fingers inward
// toward the battery at both ends. Mirror axially by turning the rear part
// 180 degrees around X. Retain with M4 rods, washers and nuts.
// Use thin removable pads at the two face contacts. Adjust nuts so pads
// just touch battery shell. Keep contact away from switches and latch.
// "front" exports the front insert in print orientation: flat deck on bed.
// Use four 4 mm rigid M3 spacers on the DIN face. "spacer" exports one.
// The Rev C battery saddles and rear guide use the same interfaces.
// "rear" is the optional rear guide ring. "gauge" is the diameter coupon.
// "assembly" is a preview. Hardware, plug, cap and device are omitted.
// Rev C fit is provisional. Check contact locations and rod clearance with
// the actual pack before final assembly. Do not force the pack through.

part = "front";
bore_min = 103;
diametral_gap = 1.0;
length_axial = 40;
land_width = 8;
ring_wall = 6;
shell_wall = 7;
mid_relief = 0.35; // Radial relief between the two pipe-contact lands
rod_tube_od = 13;
deck_thickness = 10;
standoff_height = 4;
spacer_od = 9;
spacer_bore = 3.6;
screw_clearance = 3.4;
lead_chamfer = 0.7;


battery_length = 113;
rod_y = 43;
rod_hole = 4.5;
ear_radius = 5.5;
saddle_thickness = 6;
finger_length = 6;
finger_inner_y = 34; // Photo estimate, measured from tube axis
finger_width = 3;
finger_x = 22; // Contacts at battery side only
finger_depth_x = 7;
front_cable_gap = 30;
end_pad = 1;
rear_guide_gap = 8;

$fn = 120;
r = (bore_min - diametral_gap) / 2;
body_length = length_axial - standoff_height;
hole_centers = [for (x = [-15, 15], y = [-31, 31]) [x, y]];
rod_positions = [-rod_y, rod_y];
pack_front = -front_cable_gap;
pack_back = pack_front - battery_length;
rear_start = pack_back - end_pad - saddle_thickness - rear_guide_gap - land_width;

assert(part == "saddle" || part == "front" || part == "rear" ||
       part == "gauge" || part == "spacer" || part == "assembly", "Unknown part.");
assert(rod_y + rod_tube_od / 2 <= r - lead_chamfer,
       "Rod sleeves exceed the entry chamfer.");
assert(rod_y + rod_tube_od / 2 > r - mid_relief - shell_wall,
       "Rod sleeves must overlap the sidewall.");
assert(2 * (land_width + mid_relief) < body_length && deck_thickness < body_length,
       "Check front insert axial dimensions.");
assert(rod_y + ear_radius < r - lead_chamfer, "Rod ears exceed fit diameter.");
assert(norm([finger_x + finger_depth_x, finger_inner_y + finger_width]) < r,
       "Locating fingers exceed fit diameter.");
assert(rod_y - rod_hole / 2 > 31 + screw_clearance / 2,
       "Check DIN mounting hole clearance.");

echo(guide_od = 2 * r, rod_spacing = 2 * rod_y,
     assembly_length_excluding_device_and_hardware = length_axial - rear_start);

module rod_bores(start, depth) {
    for (y = rod_positions)
        translate([0, y, start])
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

// Continuous wall carries transverse shear and torsion between the lands.
module front_outer_profile() {
    rotate_extrude()
        polygon([
            [0, 0], [r - lead_chamfer, 0], [r, lead_chamfer],
            [r, land_width], [r - mid_relief, land_width + mid_relief],
            [r - mid_relief, body_length - land_width - mid_relief],
            [r, body_length - land_width], [r, body_length - lead_chamfer],
            [r - lead_chamfer, body_length], [0, body_length]
        ]);
}

module insert() {
    difference() {
        union() {
            difference() {
                front_outer_profile();
                translate([0, 0, -1])
                    cylinder(h = body_length - deck_thickness + 1,
                             r = r - mid_relief - shell_wall);
            }
            // Full-height sleeves merge into the wall and support M4 clamping.
            for (y = rod_positions)
                translate([0, y, 0])
                    cylinder(h = body_length, d = rod_tube_od);
        }
        for (p = hole_centers)
            translate([p[0], p[1], body_length - deck_thickness - 1])
                cylinder(h = deck_thickness + 2,
                         d = screw_clearance);
        rod_bores(-1, body_length + 2);
        // Rounded corners reduce stress concentration at the cable window.
        translate([0, 0, body_length - deck_thickness - 1])
            linear_extrude(height = deck_thickness + 2)
                hull() for (x = [-10, 10], y = [-7, 7])
                    translate([x, y]) circle(r = 2);
    }
}

module rear_guide() {
    difference() {
        union() {
            annular_land();
            for (y = rod_positions)
                translate([0, y, 0])
                    cylinder(h = land_width, r = ear_radius);
        }
        rod_bores(-1, land_width + 2);
    }
}


// The two arms leave the ADP05 face and the battery indicator area open.
module saddle() {
    difference() {
        union() {
            linear_extrude(height = saddle_thickness)
                union() {
                hull() for (side = [-1, 1])
                    translate([finger_x + finger_depth_x / 2,
                               side * (finger_inner_y - 2)]) circle(r = 4);
                for (side = [-1, 1])
                    hull() {
                        translate([0, side * rod_y]) circle(r = ear_radius);
                        translate([finger_x + finger_depth_x / 2,
                                   side * (finger_inner_y - 3)])
                            circle(r = 4);
                    }
                }
            for (side = [-1, 1])
                hull() {
                    translate([finger_x, side > 0 ? finger_inner_y :
                               -finger_inner_y - finger_width, saddle_thickness - 1])
                        cube([finger_depth_x, finger_width, finger_length + 1]);
                    translate([finger_x, side > 0 ? finger_inner_y - 4 :
                               -finger_inner_y - finger_width, saddle_thickness - 1])
                        cube([finger_depth_x, finger_width + 4, 1]);
                }
        }
        rod_bores(-1, saddle_thickness + 2);
    }
}

module spacer() {
    difference() {
        cylinder(d = spacer_od, h = standoff_height);
        translate([0, 0, -1])
            cylinder(d = spacer_bore, h = standoff_height + 2);
    }
}

module assembly() {
    color("steelblue") insert();
    for (p = hole_centers)
        color("steelblue") translate([p[0], p[1], body_length]) spacer();
    color("steelblue") translate([0, 0, rear_start]) rear_guide();
    color("orange") translate([0, 0, pack_back - end_pad - saddle_thickness]) saddle();
    color("orange") translate([0, 0, pack_front + end_pad + saddle_thickness])
        rotate([180, 0, 0]) saddle();
    for (y = rod_positions)
        color("silver") translate([0, y, rear_start])
            cylinder(d = 4, h = body_length - rear_start);
    // Rough end-view silhouette for orientation only.
    %translate([0, 0, pack_back])
        linear_extrude(height = battery_length)
            hull() for (x = [3, 29], y = [-28, 28])
                translate([x, y]) circle(r = 5);
    %translate([0, 0, pack_front - 102])
        linear_extrude(height = 102)
            hull() for (x = [-34, -7], y = [-27, 27])
                translate([x, y]) circle(r = 5);
}

if (part == "saddle") saddle();
if (part == "front")
    translate([0, 0, body_length]) rotate([180, 0, 0]) insert();
if (part == "spacer") spacer();
if (part == "rear") rear_guide();
if (part == "gauge") annular_land();
if (part == "assembly") assembly();

