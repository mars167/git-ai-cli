fn hello() {
    println!("Hello from Rust");
}

struct Greeter;

impl Greeter {
    fn greet(&self) {
        println!("Greetings");
    }
}

fn main() {
    hello();
    let g = Greeter;
    g.greet();
}
