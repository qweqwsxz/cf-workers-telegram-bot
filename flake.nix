{
  description = "CF Workers Telegram Bot development environment";
  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
  };
  outputs =
    { nixpkgs, ... }:
    let
      forAllSystems = nixpkgs.lib.genSystems [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
    in
    {
      devShells = forAllSystems (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
        in
        {
          default = pkgs.mkShell {
            buildInputs = with pkgs; [
              efm-langserver
              nil
              nodejs_latest
              typescript-language-server
              prettier
              vscode-langservers-extracted
            ];
          };
        }
      );
    };
}
